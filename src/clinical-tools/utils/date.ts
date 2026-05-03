export const parseDateUTC=(s:string)=> new Date(`${s}T00:00:00Z`);
export const addDays=(d:Date,n:number)=> new Date(d.getTime()+n*86400000);
