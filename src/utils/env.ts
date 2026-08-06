function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(`Missing environment variable: ${name} (set it in .env, see .env.example)`);
  }
  return value ?? '';
}

export const env = {
  usdaFdcApiKey: requireEnv('EXPO_PUBLIC_USDA_FDC_API_KEY', process.env.EXPO_PUBLIC_USDA_FDC_API_KEY),
  groqApiKey: requireEnv('EXPO_PUBLIC_GROQ_API_KEY', process.env.EXPO_PUBLIC_GROQ_API_KEY),
  geminiApiKey: requireEnv('EXPO_PUBLIC_GEMINI_API_KEY', process.env.EXPO_PUBLIC_GEMINI_API_KEY),
};
