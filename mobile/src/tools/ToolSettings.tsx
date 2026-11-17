import {useState} from 'react';
import {Text,TextInput,Switch,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {TOOL_CATEGORIES} from '../../../src/tools/types';
import type {ToolSearchSettings,ToolCategory} from './types';
import {DEFAULT_TOOL_SETTINGS,saveToolSettings,toolSettingsError} from './settings';
import {toolCategoryLabels} from './display';
import {Button,Section,styles,colors} from '../ui';
export function ToolSettings({settings,onSaved,onCancel}:{settings:ToolSearchSettings;onSaved:(s:ToolSearchSettings)=>void;onCancel:()=>void}){
  const [location,setLocation]=useState(settings.location),[radius,setRadius]=useState(String(settings.radiusKm));
  const [min,setMin]=useState(String(settings.minPriceEur)),[max,setMax]=useState(String(settings.maxPriceEur));
  const [category,setCategory]=useState<ToolCategory|'ALL'>(settings.categories==='ALL'?'ALL':settings.categories[0]??'ALL');
  const [choose,setChoose]=useState(false),[exclude,setExclude]=useState(settings.excludeBroken),[limit,setLimit]=useState(settings.limit);
  const [saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null);
  async function save(reset=false){if(saving)return;
    const number=(value:string)=>value.trim()?Number(value.replace(',','.')):NaN;
    const next:ToolSearchSettings=reset?{...DEFAULT_TOOL_SETTINGS}:{...settings,location:location.trim(),radiusKm:number(radius),minPriceEur:number(min),maxPriceEur:number(max),
      categories:category==='ALL'?'ALL':[category],excludeBroken:exclude,limit};
    if(!reset&&location.trim()!==settings.location)delete next.origin;
    const issue=toolSettingsError(next);if(issue){setError(issue);return;}setSaving(true);setError(null);
    try{await saveToolSettings(AsyncStorage,next);onSaved(next);}catch{setError('Setările nu au putut fi salvate.');}finally{setSaving(false);}
  }
  return <Section title="SCULE — SETĂRI">
    <Text style={styles.muted}>Locații disponibile: Deva, Hunedoara, Orăștie</Text>
    {([['Locație',location,setLocation,false],['Rază (km)',radius,setRadius,true],['Buget minim (€)',min,setMin,true],['Buget maxim (€)',max,setMax,true]] as const).map(([label,value,change,numeric])=><View key={label}>
      <Text style={styles.body}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} editable={!saving} keyboardType={numeric?'numeric':'default'} style={{padding:12,borderWidth:1,borderColor:colors.line,fontSize:18}}/>
    </View>)}
    <Button title={`Categorie: ${category==='ALL'?'Toate':toolCategoryLabels[category]}`} secondary disabled={saving} onPress={()=>setChoose(v=>!v)}/>
    {choose&&(['ALL',...TOOL_CATEGORIES] as const).map(c=><Button key={c} title={c==='ALL'?'Toate categoriile':toolCategoryLabels[c]} secondary={c!==category} onPress={()=>{setCategory(c);setChoose(false);}}/>)}
    <View style={styles.row}><Text style={styles.body}>Exclude defecte grave</Text><Switch accessibilityLabel="Exclude defecte grave scule" value={exclude} onValueChange={setExclude} disabled={saving}/></View>
    <Text style={styles.body}>Număr rezultate</Text><View style={styles.row}>{[10,20,30].map(n=><Button key={n} title={`${limit===n?'✓ ':''}${n}`} secondary={limit!==n} disabled={saving} onPress={()=>setLimit(n)}/>)}</View>
    {error&&<Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
    <Button title={saving?'SE SALVEAZĂ...':'SALVEAZĂ SETĂRILE'} disabled={saving} onPress={()=>{void save();}}/>
    <Button title="RESETEAZĂ" secondary disabled={saving} onPress={()=>{void save(true);}}/><Button title="ÎNAPOI" secondary disabled={saving} onPress={onCancel}/>
  </Section>;
}
