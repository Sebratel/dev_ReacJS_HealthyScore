import raw from './realClients.json'
import type { RealClient } from '@/types'

export interface RealClientsMeta {
  generatedAt: string
  source: string
  fromDate: string
  sampleSize: number
}
export interface RealTotals { clients: number; contracts: number; mrr: number }
export interface RealCityAgg { city: string; contracts: number; mrr: number }
export interface RealMonthly { month: string; onTime: number; late: number; overdue: number }
export interface RealDistinctEntry { value: string; count: number }
export interface RealValueEntry { value: number; count: number }
export interface RealCommercial {
  sellers: RealDistinctEntry[]
  plans: RealDistinctEntry[]
  values: RealValueEntry[]
  cities: RealDistinctEntry[]
  neighborhoods: RealDistinctEntry[]
  clientGenders: RealDistinctEntry[]
  sellerGenders: RealDistinctEntry[]
}
export interface RealConnection {
  models: RealDistinctEntry[]
}

interface RealClientsFile {
  meta: RealClientsMeta
  totals: RealTotals
  paymentForms: string[]
  byCity: RealCityAgg[]
  monthly: RealMonthly[]
  commercial: RealCommercial
  connection: RealConnection
  clients: RealClient[]
}

// Cast através de unknown para evitar inferência de tipo literal gigante no tsc
const data = raw as unknown as RealClientsFile

export const realMeta = data.meta
export const realTotals = data.totals
export const realPaymentForms = data.paymentForms
export const realByCity = data.byCity
export const realMonthly = data.monthly
export const realCommercial = data.commercial
export const realConnection = data.connection
export const realClients: RealClient[] = data.clients
