import {writeFile} from 'node:fs/promises';
// Deterministic invented data; no source pages, images, network or currency conversion.
const profiles=[
  ['Makita','DGA504','ANGLE_GRINDER','BATTERY',130,{voltageV:18,batteriesIncluded:0,chargerIncluded:false}],
  ['Makita','DDF484','DRILL','BATTERY',250,{voltageV:18,batteryAh:5,batteriesIncluded:2,chargerIncluded:true}],
  ['Bosch Professional','GSR 18V-55','DRILL','BATTERY',230,{voltageV:18,batteryAh:4,batteriesIncluded:2,chargerIncluded:true}],
  ['Bosch','UniversalImpact 800','DRILL','CORDED',65,{powerWatts:800,voltageV:230}],
  ['DeWalt','DCD796','DRILL','BATTERY',150,{voltageV:18,batteryAh:2,batteriesIncluded:1,chargerIncluded:false}],
  ['Milwaukee','M18 FID2','IMPACT_DRIVER','BATTERY',180,{voltageV:18,batteriesIncluded:0,chargerIncluded:false}],
  ['Hilti','TE 30','DEMOLITION_HAMMER','CORDED',400,{powerWatts:1010,voltageV:230}],
  ['Einhell','TC-CS 1410','CIRCULAR_SAW','CORDED',55,{powerWatts:1410,voltageV:230}],
  ['Parkside','PWS 125','ANGLE_GRINDER','CORDED',30,{powerWatts:1200,voltageV:230}],
  ['Stihl','MS 261','CHAINSAW','PETROL',520,{engineCc:50.2,horsepower:4.1}],
  ['Husqvarna','135 Mark II','CHAINSAW','PETROL',180,{engineCc:38,horsepower:2.1}],
  ['Karcher','K5','PRESSURE_WASHER','CORDED',210,{powerWatts:2100,voltageV:230}],
  ['Ruris','DAC 150XL','BRUSHCUTTER','PETROL',95,{engineCc:52,horsepower:2}],
  ['Honda','EU22i','GENERATOR','PETROL',850,{powerWatts:2200,engineCc:121}],
  ['Stanley','DN200','COMPRESSOR','CORDED',110,{powerWatts:1100,voltageV:230}],
  ['Hecht','1802','MOWER','CORDED',80,{powerWatts:1800,voltageV:230}],
  ['Ruris','AS 200','WELDER','CORDED',120,{voltageV:230}],
  ['Metabo','W 850-125','ANGLE_GRINDER','CORDED',65,{powerWatts:850,voltageV:230}],
];
const places=[['Deva',45.878,22.914],['Hunedoara',45.75,22.9],['Orăștie',45.842,23.2],['Hațeg',45.61,22.95]];
function listing(profile,id,factor,index,market=false){
  const [brand,model,category,powerSource,price,fields]=profile;
  const [locationText,latitude,longitude]=market?['Piață națională DEMO',44.43,26.1]:places[index%places.length];
  const body=powerSource==='BATTERY'&&fields.batteriesIncluded===0;
  return {id,source:'tool-demo',url:`https://example.invalid/tools/${id}`,title:`${brand} ${model} — DEMO`,brand,model,identityConfidence:95,
    category,subcategory:null,priceEur:Math.round(price*factor),condition:'USED',powerSource,powerWatts:null,voltageV:null,batteryAh:null,
    engineCc:null,horsepower:null,batteriesIncluded:null,chargerIncluded:null,...fields,
    accessories:fields.chargerIncluded?['valiză','manual']:['manual'],manufacturingYear:2022,
    locationText,latitude,longitude,description:`Date sintetice. Funcționare declarată normală, proba este necesară. ${body?'Body only, fără acumulator și încărcător.':'Pachetul declarat poate fi verificat la probă.'}`,
    imageUrl:null,imageUrls:[],thumbnailUrl:null,sellerType:'PRIVATE',publishedAt:'2026-09-15T08:00:00.000Z',synthetic:true};
}
const local=profiles.flatMap((p,i)=>[0.68,0.96,1.05,1.6].map((factor,j)=>listing(p,`tool-local-${i}-${j}`,factor,j)));
const market=profiles.flatMap((p,i)=>[0.92,0.95,0.98,1,1.02,1.04,1.06,1.08].map((factor,j)=>listing(p,`tool-market-${i}-${j}`,factor,j,true)));
const edge=(name,index,changes)=>({...listing(profiles[index],`tool-edge-${name}`,0.7,index),...changes});
local.push(
  edge('battery',1,{description:'Acumulator defect, nu ține bateria.'}),
  edge('mechanical',9,{description:'Motor defect, compresie slabă, nu pornește.'}),
  edge('electrical',6,{description:'Motor electric defect, cablu tăiat, scântei.'}),
  edge('cosmetic',0,{description:'Body only, fără acumulator. Zgârieturi și uzură estetică.'}),
  edge('authenticity',1,{description:'Acumulator compatibil aftermarket. Autenticitatea accesoriilor trebuie verificată.'}),
  edge('unknown',0,{title:'Sculă de atelier DEMO',brand:null,model:null,identityConfidence:0,category:'OTHER',powerSource:'UNKNOWN',batteriesIncluded:null,chargerIncluded:null,voltageV:null}),
  edge('incomplete',1,{batteriesIncluded:1,chargerIncluded:false,accessories:[],description:'Un acumulator inclus. Încărcător neinclus.'}),
  edge('conflict',1,{description:'Body-only, fără acumulator.',batteriesIncluded:2,chargerIncluded:true}),
  edge('like-new',11,{condition:'LIKE_NEW',priceEur:200,description:'Utilizat de câteva ori. Stare declarată aproape nouă.'}),
  edge('parts',16,{condition:'FOR_PARTS',priceEur:20,description:'Pentru piese, nefuncțional.'}),
  edge('worn',8,{description:'Carcasă spartă, mâner crăpat, foarte uzat.'}),
  edge('new',4,{condition:'NEW',priceEur:240,manufacturingYear:2026,description:'Produs declarat nou. Un acumulator inclus, fără încărcător.'}),
);
await writeFile('fixtures/tools.json',JSON.stringify({synthetic:true,description:'Invented offline DEMO data, not real offers',local,market},null,2)+'\n');
console.log(`Tools fixtures: ${local.length} local + ${market.length} comparables, all synthetic.`);
