export const useRealApi = process.env.E2E_USE_REAL_API === '1'

export const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173'
export const apiBaseURL = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:8787'

export const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@laien.io'
export const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'laien123456'
