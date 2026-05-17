import { generateCustomers, generatePayments, generateProtocols, generateNetworkEvents, generateSellers } from './generators'

export const mockCustomers = generateCustomers(500)
export const mockPayments = generatePayments(mockCustomers)
export const mockProtocols = generateProtocols(mockCustomers)
export const mockNetworkEvents = generateNetworkEvents()
export const mockSellers = generateSellers()

export { generateTimeline, MONTHLY_CHURN } from './generators'
