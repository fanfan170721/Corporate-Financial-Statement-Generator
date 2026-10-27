/** Search language never changes an issuer's legal name, symbol or filing identity. */
export function normalizeCompanySearch(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").toLowerCase().trim().replace(/\s+/g,' ');
}
export function companySearchTerm(query: string): string {
  return normalizeCompanySearch(query).replace(/^(?:(?:rapport|rapports|bilan|bilans|etats financiers|actions?|societe|entreprise|compagnie|groupe)\s+(?:financiers?\s+)?(?:(?:de|du|des|sur|pour|la|le|les)\s+|d')*)+/,'').trim();
}
const frenchNames: Record<string,string[]> = {
  RY:['banque royale du canada','banque royale','rbc'],
  TD:['banque toronto dominion','banque toronto-dominion','groupe banque td'],
  BMO:['banque de montreal','bmo groupe financier'],
  BNS:['banque de nouvelle ecosse','banque scotia'],
  CM:['banque canadienne imperiale de commerce','banque cibc'],
  CNI:['canadien national','compagnie des chemins de fer nationaux du canada'],
  CP:['canadien pacifique kansas city','canadien pacifique','cpkc'],
  MFC:['financiere manuvie','manuvie'], SLF:['financiere sun life','sun life'],
  BCE:['bell canada','bce'], TU:['telus'], RCI:['rogers communications'],
  CNQ:['canadian natural resources','ressources naturelles canadiennes'],
  SU:['suncor energie','suncor'], ENB:['enbridge'], TRP:['tc energie','tc energy'],
  TECK:['teck ressources','teck resources'], WCN:['waste connections'],
  META:['facebook','meta'], GOOGL:['google','alphabet'],
  TSM:['taiwan semiconductor','tsmc'], BRK_B:['berkshire hathaway'],
};
const sectorTerms: Record<string,string[]> = {
  'Semiconductors':['semi conducteurs','semi-conducteurs','puces','semiconducteurs'],
  'Software & cloud':['logiciel','logiciels','infonuagique','nuage informatique','logiciels et infonuagique'],
  'Consumer technology':['technologies grand public','electronique grand public'],
  'Internet & platforms':['internet','plateformes','reseaux sociaux','commerce electronique'],
  'Healthcare':['sante','soins de sante','pharmaceutique','pharmacie','medicaments'],
  'Financial services':['banque','banques','services financiers','finance','assurances','paiements'],
  'Energy transition':['transition energetique','vehicules electriques','energie propre'],
  'Energy':['energie','petrole','gaz naturel'],
  'Industrials':['industrie','industries','aerospatiale','industriel'],
  'Consumer & retail':['commerce de detail','consommation','distribution','alimentation','biens de consommation'],
};
export function frenchAliasSymbols(query:string): Set<string> {
  const aliasKey=(value:string)=>value.replace(/[-‐‑–—]/g,' ').replace(/\s+/g,' ').trim();
  const term=aliasKey(companySearchTerm(query));
  return new Set(Object.entries(frenchNames).filter(([,names])=>names.some(name=>aliasKey(name)===term||(term.length>=4&&aliasKey(name).startsWith(term)))).map(([symbol])=>symbol==='BRK_B'?'BRK-B':symbol));
}
export function frenchSearchSectors(query:string): Set<string> {
  const term=companySearchTerm(query);
  return new Set(Object.entries(sectorTerms).filter(([,names])=>names.includes(term)).map(([sector])=>sector));
}
