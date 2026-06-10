import type { MetadataRoute } from 'next'

const SITE_URL = 'https://naywastudio.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: SITE_URL,                  lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${SITE_URL}/solutions`,   lastModified: now, changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${SITE_URL}/a-propos`,    lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/tarifs`,      lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/contact`,     lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/faq`,         lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/mentions-legales`,           lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/politique-confidentialite`,  lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cgu`,                        lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
