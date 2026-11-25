import type {StudioSettings} from "./actions";
/** Preserve only technical image preferences when changing factory/brand. */
export function studioForFactory(previous:StudioSettings,hasLogo:boolean):StudioSettings {
 return {model:previous.model,quality:previous.quality,format:previous.format,n:5,textInImage:false,logo:hasLogo,logoPos:"br",style:"",structure:""};
}
export function sameBrand(brandId:string|null|undefined,active:string|undefined):boolean {
 return !!active&&brandId===active;
}
