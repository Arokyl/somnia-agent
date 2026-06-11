function parseOrigins(value?: string) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function getAllowedOrigins() {
  return parseOrigins(process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
}
