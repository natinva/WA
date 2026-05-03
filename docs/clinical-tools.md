# Klinik Destek Tool'ları

Bu modülde 30 tool registry üzerinden çalışır halde sunulur.

## Durum Özeti
- Implemented: 30/30 (bazıları güvenlik gereği integration pending içerikli kontrollü çıktı üretir).
- Lisans gerektiren yüksek riskli modüller klinik veri uydurmaz; yalnızca "integration pending" bilgisi döner.

## Paket Dağılımı
- Basic: temel hesaplayıcılar, red-flag, ICD arama, dokümantasyon.
- Pro: LOINC/RxNorm/TİTCK arama, guideline arama, aşı, kardiyovasküler risk, karaciğer/pediatrik büyüme.
- Elite: SNOMED, etkileşim, kontrendikasyon, renal-dose warning, gebelik/laktasyon güvenliği, ayırıcı tanı checklist, stewardship.

## Regülasyon Notları
- Bu çıktılar klinik kararın yerine geçmez.
- Son karar hekimindir.
- Acil/kritik durumda yerel acil protokoller uygulanmalıdır.
- Tanı koydurucu/tedavi emri veren dil kullanılmaz.

## Test Komutları
- npm test
- npm run lint
- npm run build
