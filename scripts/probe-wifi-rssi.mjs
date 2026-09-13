// Levantamento do RSSI de Wi-Fi no AutoISP (Int6) — base para um indicador novo
// na Connection Engine. Roda contra DB_AUTOISP_*; só leitura, em segundos.
//
// O que ficou provado (12/09/2026):
//  · O RSSI existe no TR-069, em acs_device_statuses.last_analytics_data_translated,
//    na chave ...WLANConfiguration.<radio>.AssociatedDevice.<n>.X_INT6_RSSI
//    (radio 1 = 2.4 GHz, 5 = 5 GHz). Junto vêm X_INT6_Noise e X_INT6_SNR.
//  · As tabelas prontas analytics_device_dailies / _rollup_stats têm as colunas
//    certas (rssi_ok/warn/crit por banda) mas estão VAZIAS e sem grant — pedir
//    acesso a elas não resolveria nada.
//  · Agregar pelo PIOR dispositivo é armadilha: mede quantos aparelhos a casa
//    tem, não a qualidade do Wi-Fi. Use a MEDIANA (ver consulta VIÉS).
import { makeAutoIspPool } from './db-autoisp.mjs'
import { buildEffectiveQueries } from './queries/index.mjs'

const pool = makeAutoIspPool()
const q = async (label, sql) => {
  const t = Date.now()
  try {
    const r = await pool.query(sql)
    console.log(`\n=== ${label} — ${((Date.now() - t) / 1000).toFixed(1)}s (${r.rowCount} linhas) ===`)
    r.rows.slice(0, 15).forEach((row) => console.log('  ' + JSON.stringify(row)))
    if (r.rowCount > 15) console.log(`  ... +${r.rowCount - 15} linhas`)
    return r.rows
  } catch (e) {
    console.log(`\n=== ${label} — ERRO: ${e.message} ===`)
    return null
  }
}

// Bloco reaproveitado: uma linha por contrato com os dispositivos Wi-Fi lidos.
// O filtro por last_inform é o que segura o custo — é coluna inline, avaliada
// ANTES de destoastar o jsonb (1,7 GB na tabela inteira).
const POR_CONTRATO = `
  with fresco as (
    select ads.device_id, ads.last_inform, ads.last_analytics_data_translated d
    from acs_device_statuses ads
    where ads.last_inform >= now() - interval '48 hours'
      and ads.last_analytics_data_translated is not null
  ),
  leituras as (
    select f.device_id, f.last_inform,
      substring(e.key from 'WLANConfiguration\\.(\\d+)\\.') radio,
      e.value::numeric rssi
    from fresco f, lateral jsonb_each_text(f.d) e
    where e.key like '%.AssociatedDevice.%.X_INT6_RSSI' and e.value ~ '^-[0-9]+$'
  ),
  por_contrato as (
    select cs.contract_id, count(*) devices, min(l.rssi) pior,
      percentile_cont(0.5) within group (order by l.rssi) mediano,
      round(100.0 * count(*) filter (where l.rssi <= -70) / count(*), 1) pct_ruins,
      max(l.last_inform) lida_em
    from leituras l
    join acs_clients ac on ac.device_id = l.device_id
    join gpon_clients gc on gc.id = ac.gpon_client_id
    join contracted_services cs on cs.id = gc.contracted_service_id
    where cs.contract_id is not null
    group by cs.contract_id
  )`

try {
  await q('ONDE o dado mora — tabelas e colunas de Wi-Fi/sinal, e se dá para ler', `
    select c.relname tabela, a.attname coluna,
           pg_size_pretty(pg_total_relation_size(c.oid)) tamanho,
           has_table_privilege(c.oid,'select') posso_ler
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped
      and a.attname ~* 'rssi|noise|snr'
    order by c.relname, a.attname`)

  await q('AS TABELAS PRONTAS ESTÃO VAZIAS (relpages = páginas de 8 kB gravadas)', `
    select c.relname, c.relpages, pg_size_pretty(pg_relation_size(c.oid)) heap,
           has_table_privilege(c.oid,'select') posso_ler
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public'
      and c.relname in ('analytics_device_dailies','analytics_device_rollup_stats','wifi_readings')`)

  await q('FRESCOR do TR-069', `
    select count(*) cpes, max(last_inform) ultimo_inform,
      count(*) filter (where last_inform >= now() - interval '24 hours') informou_24h,
      count(*) filter (where last_inform >= now() - interval '48 hours') informou_48h
    from acs_device_statuses`)

  await q('COBERTURA por modelo de CPE (amostra 3000 com inform em 24h)', `
    with s as (
      select device_model_name, manufacturer, last_analytics_data_translated d
      from acs_device_statuses where last_inform >= now() - interval '24 hours' limit 3000
    )
    select coalesce(nullif(device_model_name,''),'(sem modelo)') modelo, manufacturer, count(*) cpes,
      count(*) filter (where d ? 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDevice.1.X_INT6_RSSI') com_rssi_24g,
      count(*) filter (where d ? 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.AssociatedDevice.1.X_INT6_RSSI') com_rssi_5g
    from s group by 1,2 order by cpes desc limit 8`)

  await q('COBERTURA sobre a base de contratos', `
    ${POR_CONTRATO}
    select (select count(distinct cs.contract_id) from contracted_services cs
             join gpon_clients gc on gc.contracted_service_id = cs.id
             join acs_clients ac on ac.gpon_client_id = gc.id
             where cs.contract_id is not null) contratos_com_cpe,
           (select count(*) from por_contrato) contratos_com_rssi`)

  await q('VIÉS — por que NÃO usar o pior dispositivo (compare as duas colunas pct_)', `
    ${POR_CONTRATO}
    select case when devices >= 6 then '6+' else devices::text end n_devices,
      count(*) contratos,
      round(avg(pior)::numeric,1) media_do_pior,
      round(avg(mediano)::numeric,1) media_da_mediana,
      round(100.0 * count(*) filter (where pior <= -72) / count(*),1) pct_marcados_pelo_pior,
      round(100.0 * count(*) filter (where mediano <= -72) / count(*),1) pct_marcados_pela_mediana
    from por_contrato group by 1 order by 1`)

  await q('CALIBRAGEM — distribuição da MEDIANA (é ela que vira faixa na tela)', `
    ${POR_CONTRATO}
    select case
        when mediano > -60 then 'a) boa (> -60 dBm)'
        when mediano > -67 then 'b) aceitavel (-60 a -67)'
        when mediano > -72 then 'c) fraca (-67 a -72)'
        when mediano > -80 then 'd) ruim (-72 a -80)'
        else 'e) critica (<= -80)' end faixa,
      count(*) contratos, round(100.0 * count(*) / sum(count(*)) over (),1) pct
    from por_contrato group by 1 order by 1`)

  // Fecha o circuito: roda a query como o ETL roda — saindo do registro, com
  // override aplicado e guard de somente-leitura no caminho. É aqui que um
  // escape errado no template aparece, não nas consultas soltas acima.
  const { Q_AUTOISP_WIFI } = buildEffectiveQueries({ full: false })
  const rows = await q('Q_AUTOISP_WIFI — a query DE PRODUÇÃO, vinda do registro', Q_AUTOISP_WIFI)
  if (rows) {
    const comRssi = rows.filter((r) => r.rssi_mediano != null).length
    console.log(`\n>>> ${rows.length} contratos | ${comRssi} com RSSI | ${rows.length - comRssi} só com memória/temperatura do CPE`)
  }
} finally {
  await pool.end()
}
