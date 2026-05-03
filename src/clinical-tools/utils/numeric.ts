export const parseTRNumber = (v: unknown): number => { if (typeof v==='number') return v; if (typeof v!=='string') throw new Error('Sayısal değer gerekli'); const n = Number(v.replace(',','.')); if (Number.isNaN(n)) throw new Error('Geçersiz sayı'); return n; };
export const assertPositive = (n:number,name:string)=>{ if(n<=0) throw new Error(`${name} pozitif olmalıdır`); };
