import { makeMariaPool } from './db-maria.mjs'

const pool = await makeMariaPool()
console.log(`MariaDB ${process.env.DB_MARIA_HOST}:${process.env.DB_MARIA_PORT || 3306}/${process.env.DB_MARIA_DATABASE}…`)
try {
  const [counts] = await pool.query(`
    select count(*) total, count(distinct mhs.splitter_code) splitters,
      count(*) - count(mh.closed_at) open_massives
    from DB_Massives.massiva_history mh
    left join DB_Massives.massiva_history_splitters mhs on mhs.massiva_history_id = mh.id`)
  console.log('COUNTS:', counts[0])

  const [agg] = await pool.query(`
    select
      round(avg(timestampdiff(minute, mh.event_identified_at, mh.closed_at)),1) avg_offline_min,
      round(avg(case when mh.closed_at > mh.expected_close_at then timestampdiff(minute, mh.expected_close_at, mh.closed_at) end),1) avg_overage_min,
      count(*) filter_late
    from DB_Massives.massiva_history mh
    where mh.closed_at is not null`)
  console.log('SLA (min):', agg[0])

  const [top] = await pool.query(`
    select mhs.splitter_code, count(*) n,
      round(avg(timestampdiff(minute, mh.event_identified_at, mh.closed_at)),1) avg_offline_min
    from DB_Massives.massiva_history mh
    left join DB_Massives.massiva_history_splitters mhs on mhs.massiva_history_id = mh.id
    where mhs.splitter_code is not null
    group by mhs.splitter_code order by n desc limit 8`)
  console.log('\nTOP SPLITTERS c/ massivas:'); top.forEach((r) => console.log(`  ${String(r.n).padStart(5)}  off=${r.avg_offline_min}min  ${r.splitter_code}`))

  const [sample] = await pool.query(`
    select mh.id, mh.opened_at, mh.event_identified_at, mh.expected_close_at, mh.closed_at, mhs.splitter_code
    from DB_Massives.massiva_history mh
    left join DB_Massives.massiva_history_splitters mhs on mhs.massiva_history_id = mh.id
    limit 2`)
  console.log('\nAMOSTRA:', JSON.stringify(sample, null, 1))
} catch (e) { console.error('ERRO:', e.message); process.exitCode = 1 } finally { await pool.end() }
