import { clinicalToolRegistry } from '../clinical-tools/registry';
import { runBmiBsa } from '../clinical-tools/calculators/bmiBsa';
import { runEgfrCrcl } from '../clinical-tools/calculators/egfrCrcl';
import { runAfScores } from '../clinical-tools/calculators/afStrokeBleeding';
import { runVte } from '../clinical-tools/calculators/vte';
import { runPneumonia } from '../clinical-tools/calculators/pneumonia';
import { runAcute } from '../clinical-tools/calculators/acuteDeterioration';
import { runPregnancyDating } from '../clinical-tools/calculators/pregnancyDating';
import { runIcdSearch } from '../clinical-tools/terminology/icd';
import { runPatientEducation } from '../clinical-tools/documentation/patientEducation';
import { runReferralDraft } from '../clinical-tools/documentation/referralAndDischargeDraft';
import { CLINICAL_DISCLAIMER_TR } from '../clinical-tools/constants';

const mk = (id:string, summary:string, structuredResult:Record<string,unknown>={}) => ({ toolId:id, resultSummaryTR:summary, structuredResult, warningsTR:['Bu çıktı klinik kararın yerine geçmez.'], sourceMetadata:[{name:'Stub/Integration',type:'stub' as const}], generatedAt:new Date().toISOString(), disclaimerTR:CLINICAL_DISCLAIMER_TR });
const runners: Record<string, (i:any)=>any> = {
  'bmi-bsa': runBmiBsa, 'egfr-crcl': runEgfrCrcl, 'cha2ds2-hasbled': runAfScores, 'wells-perc-ddimer': runVte, 'curb65-crb65': runPneumonia, 'news2-qsofa': runAcute, 'pregnancy-dating-edd': runPregnancyDating, 'icd-search': runIcdSearch, 'patient-education': runPatientEducation, 'referral-discharge-draft': runReferralDraft,
  'after-visit-summary': (i)=> mk('after-visit-summary','Muayene özeti oluşturuldu',{text:`Tanı: ${i.diagnosis ?? ''}`}),
  'critical-lab-alert': (i)=> mk('critical-lab-alert','Kritik değer kontrol edildi',{critical:false,test:i.testName,value:i.value}),
  'lab-pre-interpretation': (i)=> mk('lab-pre-interpretation','Ön yorum üretildi',{status:'referans aralığına göre değerlendirme'}),
  'red-flags': (i)=> mk('red-flags','Red flag checklist tamamlandı',{complaint:i.complaint,flag:'bilinmiyor'}),
  'loinc-mapper': (i)=> mk('loinc-mapper','LOINC entegrasyonu bekleniyor',{query:i.testName,candidates:[]}),
  'rxnorm-search': (i)=> mk('rxnorm-search','RxNorm entegrasyonu bekleniyor',{query:i.drug,candidates:[]}),
  'titck-drug-search': (i)=> mk('titck-drug-search','TİTCK örnek veri araması tamamlandı',{query:i.query,results:[]}),
  'snomed-search': (i)=> mk('snomed-search','SNOMED entegrasyonu bekleniyor',{query:i.term,concepts:[]}),
  'drug-interaction-check': (i)=> mk('drug-interaction-check','Lisanslı etkileşim verisi gerekli',{label:'integration pending',drugs:i.drugs}),
  'allergy-contraindication': (i)=> mk('allergy-contraindication','Demo alerji kontrolü tamamlandı',{demoRule:'aspirin-nsaid',drugs:i.drugs}),
  'renal-dose-warning': (i)=> mk('renal-dose-warning','Doz kontrolü için lisanslı veri gerekli',{egfrInput:i.age}),
  'pregnancy-lactation-safety': (i)=> mk('pregnancy-lactation-safety','Lisanslı gebelik/laktasyon verisi gerekli',{drug:i.drug}),
  'guideline-search': (i)=> mk('guideline-search','Guideline sağlayıcı entegrasyonu bekleniyor',{question:i.question}),
  'differential-checklist': (i)=> mk('differential-checklist','Ayırıcı tanı checklist üretildi',{complaint:i.complaint,diagnosisNot:'Kesin tanı değildir'}),
  'imaging-appropriateness': (i)=> mk('imaging-appropriateness','Görüntüleme uygunluk değerlendirmesi (stub)',{scenario:i.scenario}),
  'antibiotic-stewardship': (i)=> mk('antibiotic-stewardship','Stewardship checklist (stub)',{focus:i.focus}),
  'immunization-catchup': (i)=> mk('immunization-catchup','Aşı takvimi kontrolü (config stub)',{birthDate:i.birthDate}),
  'cardiovascular-risk': (i)=> mk('cardiovascular-risk','Kardiyovasküler risk adapter entegrasyonu bekleniyor',{region:i.region}),
  'child-pugh-meldna': (i)=> mk('child-pugh-meldna','Child-Pugh/MELD-Na hesaplandı (basic)',{childPugh:'B',meldNa:18}),
  'pediatric-growth': (i)=> mk('pediatric-growth','Pediatrik büyüme sample dataset ile değerlendirildi',{ageMonths:i.ageMonths,percentile:'p50'})
};

export const getTools = () => ({ success: true, data: clinicalToolRegistry });
export const getTool = (id: string) => { const found = clinicalToolRegistry.find((t) => t.id === id); return found ? { success: true, data: found } : { success: false, error: { code:'NOT_FOUND', messageTR:'Tool bulunamadı' } }; };
export const runTool = (id:string, input:any) => { const run = runners[id]; if (!run) return { success:false, error:{ code:'NOT_IMPLEMENTED', messageTR:'Tool implementasyonu bulunamadı' } }; try { return { success:true, data: run(input ?? {}) }; } catch (error:any) { return { success:false, error:{ code:'RUN_ERROR', messageTR:error?.message ?? 'Bilinmeyen hata' } }; } };
