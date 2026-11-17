import {useState} from 'react';
import {Text,TextInput,Switch,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {TractorSearchSettings} from './types';
import {saveTractorSettings,tractorSettingsError,DEFAULT_TRACTOR_SETTINGS} from './settings';
import {Button,Section,styles,colors} from '../ui';
const fields=[['radiusKm','Rază (km)'],['minPriceEur','Buget minim (€)'],['maxPriceEur','Buget maxim (€)'],['minYear','An minim (opțional)'],['minHorsepower','CP minim (opțional)'],['maxOperatingHours','Ore maxime (opțional)']] as const;
export function TractorSettings({settings,onSaved,onCancel}:{settings:TractorSearchSettings;onSaved:(s:TractorSearchSettings)=>void;onCancel:()=>void}){
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.map(([key])=>[key,settings[key]===null?'':String(settings[key])])));
  const [location,setLocation]=useState(settings.location),[four,setFour]=useState(settings.require4x4),[exclude,setExclude]=useState(settings.excludeBroken),[limit,setLimit]=useState(settings.limit);
  const [error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
  async function save(reset=false){if(saving)return;const number=(key:string)=>draft[key]?.trim()?Number(draft[key]!.replace(',','.')):NaN;
    const optional=(key:string)=>draft[key]?.trim()?number(key):null;
    const next=reset?{...DEFAULT_TRACTOR_SETTINGS}:{location:location.trim(),radiusKm:number('radiusKm'),minPriceEur:number('minPriceEur'),maxPriceEur:number('maxPriceEur'),
      minYear:optional('minYear'),minHorsepower:optional('minHorsepower'),maxOperatingHours:optional('maxOperatingHours'),require4x4:four,excludeBroken:exclude,limit,
      ...(location.trim()===settings.location&&settings.origin?{origin:settings.origin}:{})};
    const issue=tractorSettingsError(next);if(issue){setError(issue);return;}setSaving(true);setError(null);
    try{await saveTractorSettings(AsyncStorage,next);onSaved(next);}catch{setError('Setările nu au putut fi salvate.');}finally{setSaving(false);}}
  return <Section title="TRACTOARE — SETĂRI"><Text style={styles.body}>Locație: Deva, Hunedoara sau Orăștie</Text>
    <TextInput accessibilityLabel="Locație tractoare" value={location} onChangeText={setLocation} editable={!saving} style={{padding:12,borderWidth:1,borderColor:colors.line,fontSize:18}}/>
    {fields.map(([key,label])=><View key={key}><Text style={styles.body}>{label}</Text><TextInput accessibilityLabel={label} keyboardType="numeric" value={draft[key]} editable={!saving}
      onChangeText={text=>setDraft(old=>({...old,[key]:text}))} style={{padding:12,borderWidth:1,borderColor:colors.line,fontSize:18}}/></View>)}
    <View style={styles.row}><Text style={styles.body}>Doar 4x4</Text><Switch accessibilityLabel="Doar 4x4" value={four} onValueChange={setFour} disabled={saving}/></View>
    <View style={styles.row}><Text style={styles.body}>Exclude defecte grave</Text><Switch accessibilityLabel="Exclude defecte grave" value={exclude} onValueChange={setExclude} disabled={saving}/></View>
    <Text style={styles.body}>Număr rezultate</Text><View style={styles.row}>{[10,20,30].map(n=><Button key={n} title={`${limit===n?'✓ ':''}${n}`} onPress={()=>setLimit(n)} secondary={limit!==n} disabled={saving}/>)}</View>
    {error&&<Text accessibilityRole="alert" style={styles.body}>{error}</Text>}
    <Button title={saving?'SE SALVEAZĂ...':'SALVEAZĂ SETĂRILE'} onPress={()=>{void save();}} disabled={saving}/>
    <Button title="RESETEAZĂ" secondary onPress={()=>{void save(true);}} disabled={saving}/><Button title="ÎNAPOI" secondary onPress={onCancel} disabled={saving}/>
  </Section>;
}
