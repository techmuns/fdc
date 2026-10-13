/**
 * Private-vendor CIN seed for Probe42, keyed by the Phase-1 canonical vendor key.
 * `verify:true` means the CIN must be confirmed on MCA before a paid call.
 * `cin:null` means unresolved — resolve via GSTIN→PAN (PAN = GST chars 3-12) or
 * MCA/Tofler before spending a credit, else skip cleanly.
 */
export const PRIVATE_CINS = {
  'geep-industries-india': { cin: 'U74110MH2002PTC137887', name: 'GEEP Industries (India) Pvt Ltd' },
  'shrinath-roto-pack': { cin: 'U25209TG2006PTC050109', name: 'Shrinath Rotopack Pvt Ltd' },
  'gls-films-industries-p': { cin: 'U74950HR2003PTC127247', name: 'GLS Films Industries Pvt Ltd', verify: true },
  'chemco-plastic-industries': { cin: 'U25209MH1996PTC096963', name: 'Chemco Plastic Industries Pvt Ltd' },
  'triveni-polymers': { cin: 'U74899DL1994PTC060426', name: 'Triveni Polymers Pvt Ltd (Gerresheimer India)' },
  'tpac-packaging-india': { cin: 'U74999MH2017PTC301190', name: 'TPAC Packaging India Pvt Ltd' },
  'berry-global-india': { cin: 'U25200KA2021FTC152314', name: 'Berry Global India Pvt Ltd' },
  'pgp-glass': { cin: 'U74999MH2020PTC349649', name: 'PGP Glass Pvt Ltd' },
  'tetrapak-india': { cin: 'U21014PN1987PTC012926', name: 'Tetra Pak India Pvt Ltd', verify: true },
  'cincorp-international': { cin: 'U23209DL2008PLC184638', name: 'Cincorp International', verify: true, caveat: 'may be a trader, not a manufacturer' },
  // Bprex is now Berry Global India — reuse Berry's CIN (one fetch, cache by CIN).
  'bprex-pharma-packaging-india-p': { cin: 'U25200KA2021FTC152314', name: 'Berry Global India (formerly Bprex)', alias: 'berry-global-india' },
  // Unresolved CINs — resolve via GSTIN→PAN or MCA before any paid call.
  'pik-plastics': { cin: null, name: 'PIK Plastics' },
  'premier-plastic': { cin: null, name: 'Premier Plastic' },
  'mars-plastics': { cin: null, name: 'Mars Plastics' },
  'rachana-plastics': { cin: null, name: 'Rachana Plastics' },
  'suraj-blow-plast': { cin: null, name: 'Suraj Blow Plast Pvt Ltd' },
  'scorpion-containers': { cin: null, name: 'Scorpion Containers Pvt Ltd' },
  'silk-polypack': { cin: null, name: 'Silk Polypack' },
  'abhinav-speciality-foods-llp': { cin: null, name: 'Abhinav Speciality Foods LLP' },
  'kilitch-healthcare-india': { cin: null, name: 'Kilitch Healthcare India Ltd (loan-license)' },
};
