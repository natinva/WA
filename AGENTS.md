# Cep Doktorum Klinik Destek Araçları - AGENTS

## Proje
Bu depo, Cep Doktorum doktor üyelikleri için klinik destek araçları modülünü içerir.

## Kod dili ve stil
- Dil: TypeScript.
- Fonksiyonlar saf ve modüler olmalıdır.
- Klinik hesaplama çıktılarında disclaimer zorunludur.
- Yüksek riskli modüllerde uydurma klinik veri üretilmez; yalnızca stub/integration pending çıktısı verilir.

## Test komutları
- `npm test`

## Lint/build komutları
- `npm run lint`
- `npm run build`

## Klinik güvenlik kuralları
- Çıktılar klinik kararın yerine geçmez.
- Son karar hekimindir.
- Acil/kritik durumda yerel acil protokoller uygulanmalıdır.
- Tanı koyma, tedavi belirleme, reçete yazma ifadeleri kullanılmaz.

## Tool registry ekleme standardı
Her tool, `src/clinical-tools/registry.ts` içinde aşağıdaki metadata ile tanımlanır:
- id, titleTR, category, membershipTier, frequency, riskLevel
- descriptionTR, inputs, outputSchema
- implementationType, sources, status

## Zorunlu metadata alanları
- `sources[]` en az 1 kayıt içermelidir.
- Her kayıtta `name`, `type` zorunludur.
- Hesaplayıcılarda formül adı/versiyonu source metadata veya structuredResult içinde bulunmalıdır.
