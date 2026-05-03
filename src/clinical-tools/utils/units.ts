export const cmToM = (cm:number)=>cm/100;
export const creatinineToMgDl = (value:number,unit:'mg/dL'|'umol/L')=> unit==='mg/dL'?value:value/88.4;
