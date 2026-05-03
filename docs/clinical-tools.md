# Klinik Destek Araçları
30 tool registry'de tanımlıdır. MVP implement edilenler: bmi-bsa, egfr-crcl, cha2ds2-hasbled, wells-perc-ddimer, curb65-crb65, news2-qsofa, pregnancy-dating-edd, referral-discharge-draft, patient-education, icd-search.

## Paket dağılımı
- Basic, Pro, Elite erişim seviyeleri `registry.ts` içinde tanımlıdır.

## Regülasyon notu
Bu modül klinik kararın yerine geçmez; son karar hekimindir. Yüksek riskli modüller lisanslı veri olmadan stub durumunda tutulur.

## Test
- npm test
- npm run lint
- npm run build
