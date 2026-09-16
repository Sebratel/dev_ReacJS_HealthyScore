// O RSSI do cliente que SAIU existe? A leitura é a foto do último inform — a
// pergunta é se ela sobrevive no banco depois que o CPE para de falar (o que
// acontece quando o cliente cancela e o equipamento é recolhido).
// Se sobreviver, o "último RSSI conhecido" é aproximadamente o RSSI no fim do
// contrato, e a pergunta "quem saiu tinha Wi-Fi pior?" vira empírica.
import { makeAutoIspPool } from './db-autoisp.mjs'

const pool = makeAutoIspPool()
const q = async (label, sql) => {
  const t = Date.now()
  try {
    const r = await pool.query(sql)
    console.log(`\n=== ${label} — ${((Date.now() - t) / 1000).toFixed(1)}s ===`)
    r.rows.slice(0, 15).forEach((row) => console.log('  ' + JSON.stringify(row)))
    return r.rows
  } catch (e) {
    console.log(`\n=== ${label} — ERRO: ${e.message} ===`)
    return []
  }
}

const RSSI_KEY = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.X_INT6_RSSI'

try {
  await q('O payload sobrevive ao CPE parar de falar?', `
    select case
        when last_inform >= now() - interval '48 hours' then 'a) falou nas ultimas 48h'
        when last_inform >= now() - interval '7 days'   then 'b) 2 a 7 dias'
        when last_inform >= now() - interval '30 days'  then 'c) 7 a 30 dias'
        when last_inform >= now() - interval '180 days' then 'd) 1 a 6 meses'
        else 'e) mais de 6 meses' end idade_da_leitura,
      count(*) cpes,
      count(*) filter (where last_analytics_data_translated is not null) com_payload,
      count(*) filter (where last_analytics_data_translated ? '${RSSI_KEY}') com_rssi
    from acs_device_statuses group by 1 order by 1`)

  // O equipamento é recolhido e REUSADO: o device_id segue o aparelho, não o
  // cliente. Se o CPE de um cancelado voltou para o estoque e foi para outra
  // casa, o "último inform" é do novo dono — não do que saiu.
  await q('Risco de reúso: CPEs cujo vínculo com o cliente é mais novo que a leitura', `
    select count(*) cpes_parados,
      count(*) filter (where ac.updated_at > ads.last_inform) vinculo_mudou_depois,
      count(*) filter (where ac.gpon_client_id is null) sem_cliente_vinculado
    from acs_device_statuses ads
    left join acs_clients ac on ac.device_id = ads.device_id
    where ads.last_inform < now() - interval '7 days'`)

  await q('Distribuição do RSSI: quem ainda fala × quem parou', `
    with x as (
      select case when ads.last_inform >= now() - interval '48 hours' then 'ativo (fala hoje)'
                  when ads.last_inform >= now() - interval '180 days' then 'parou ha 2d-6m'
                  else 'parou ha mais de 6m' end grupo,
        (select percentile_cont(0.5) within group (order by e.value::numeric)
         from jsonb_each_text(ads.last_analytics_data_translated) e
         where e.key like '%.AssociatedDevice.%.X_INT6_RSSI' and e.value ~ '^-[0-9]+$') rssi_mediano
      from acs_device_statuses ads
      where ads.last_analytics_data_translated ? '${RSSI_KEY}'
    )
    select grupo, count(*) cpes,
      round(avg(rssi_mediano)::numeric,1) rssi_medio,
      round(percentile_cont(0.5) within group (order by rssi_mediano)::numeric,1) mediana,
      count(*) filter (where rssi_mediano <= -72) ruins,
      round(100.0 * count(*) filter (where rssi_mediano <= -72) / count(*),1) pct_ruins
    from x where rssi_mediano is not null group by 1 order by 1`)
} finally {
  await pool.end()
}
