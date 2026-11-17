import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SearchSession,type SearchSessionState} from '../searchSession';
import {apiErrorMessage} from '../apiClient';
import {toolsApi} from './api';
import type {ToolResult,ToolSearchResponse,ToolSearchSettings} from './types';
import {DEFAULT_TOOL_SETTINGS,loadToolSettings,toolJobStorage} from './settings';
import {toolFacts,toolPackageLabel,toolCategoryLabels,toolClassificationLabels,toolRiskLabels,toolScoreLabels,isDemoTool,powerLabels} from './display';
import {ToolSettings} from './ToolSettings';
import {money,discountText,distance} from '../display';
import {ListingImage} from '../components/ListingImage';
import {Button,Fact,Section,styles,openListing} from '../ui';

export function ToolsScreen({mode,onMode,initialSettings=false}:{mode:'LIVE'|'DEMO'|null;onMode:(mode:'LIVE'|'DEMO')=>void;initialSettings?:boolean}){
  const [settings,setSettings]=useState<ToolSearchSettings>({...DEFAULT_TOOL_SETTINGS});
  const [ready,setReady]=useState(false),[notice,setNotice]=useState<string|null>(null);
  const [stage,setStage]=useState<'search'|'settings'|'results'|'details'>(initialSettings?'settings':'search');
  const [state,setState]=useState<SearchSessionState<ToolSearchResponse>|null>(null);
  const [response,setResponse]=useState<ToolSearchResponse|null>(null),[selected,setSelected]=useState<ToolResult|null>(null),[all,setAll]=useState(false);
  const session=useRef<SearchSession<ToolSearchSettings,ToolSearchResponse>|null>(null);
  useEffect(()=>{
    const tracker=new SearchSession<ToolSearchSettings,ToolSearchResponse>(toolsApi,toolJobStorage(AsyncStorage),next=>{
      setState(next);if(next.storageWarning)setNotice(next.storageWarning);
      if(next.phase==='COMPLETED'&&next.response){setResponse(next.response);onMode(next.response.meta.mode);setAll(false);setStage(current=>current==='settings'?'settings':'results');}
    });session.current=tracker;
    const foreground=()=>{if(AppState.currentState==='active'||AppState.currentState===null)void tracker.resume();else tracker.pause();};
    const subscription=AppState.addEventListener('change',foreground);foreground();
    let active=true;loadToolSettings(AsyncStorage).then(result=>{if(active){setSettings(result.settings);if(result.recovered)setNotice('Setările sculelor au fost recuperate la implicit.');}})
      .catch(()=>{if(active)setNotice('Setările sculelor nu au putut fi citite.');}).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;subscription.remove();tracker.dispose();session.current=null;};
  },[onMode]);
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(stage==='search')return false;setStage(stage==='details'?'results':'search');return true;
  });return()=>handler.remove();},[stage]);
  const busy=!!state&&['CONNECTING','RUNNING','RECONNECTING','PAUSED'].includes(state.phase);
  const error=state?.error?apiErrorMessage(state.error):null;
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>🔧 Scule</Text>
    {notice&&<Text style={styles.muted}>{notice}</Text>}
    {!ready?<ActivityIndicator/>:stage==='settings'?<ToolSettings settings={settings} onCancel={()=>setStage('search')} onSaved={next=>{setSettings(next);setNotice('Setările sculelor au fost salvate.');setStage('search');}}/>:
      stage==='details'&&selected?<>
        <Section title={selected.listing.title}><ListingImage category="tools" mode={response?.meta.mode??mode} listingUrl={selected.listing.url} listingId={selected.listing.id} imageUrl={selected.listing.imageUrl} imageUrls={selected.listing.imageUrls} thumbnailUrl={selected.listing.thumbnailUrl} imagePresentation={selected.listing.imagePresentation} imageAttributions={selected.listing.imageAttributions} synthetic={selected.listing.synthetic} title={selected.listing.title} large/>{toolFacts(selected).map(([label,value])=><Fact key={label} label={label} value={value}/>)}</Section>
        <ToolPrices row={selected}/><Section title={toolClassificationLabels[selected.classification]}>
          {toolScoreLabels(selected).map(label=><Text key={label} style={styles.body}>{label}/100</Text>)}<Fact label="Opportunity" value={`${selected.scores.opportunity}/100`}/>
        </Section>
        <Section title="Riscuri">{(Object.keys(toolRiskLabels) as (keyof typeof toolRiskLabels)[]).map(key=><Fact key={key} label={toolRiskLabels[key]} value={`${selected.risks[key]}/100`}/>)}</Section>
        <Section title="De ce este interesant">{selected.positiveReasons.map((reason,i)=><Text key={i} style={styles.body}>{reason}</Text>)}</Section>
        <Section title="Calitate">{selected.qualityReasons.map((reason,i)=><Text key={i} style={styles.body}>{reason}</Text>)}</Section>
        <Section title="De verificat">{selected.warnings.map((warning,i)=><Text key={i} style={styles.body}>• {warning}</Text>)}</Section>
        <Text style={styles.body}>📍 {selected.listing.locationText} · {distance(selected.distanceKm)}</Text>
        <ListingAction row={selected} mode={response?.meta.mode??mode}/><Button title="ÎNAPOI LA REZULTATE" secondary onPress={()=>setStage('results')}/>
      </>:stage==='results'&&response?<>
        <Text style={styles.subtitle}>{response.results.length} rezultate · {response.meta.location} · {response.meta.radiusKm} km</Text>
        {response.meta.warnings.map((warning,i)=><Text key={i} style={styles.muted}>{warning}</Text>)}
        {response.results.length===0&&<Text style={styles.body}>Nu sunt scule care să corespundă filtrelor.</Text>}
        {(all?response.results:response.results.slice(0,10)).map(row=><Section key={row.listing.id} title={row.listing.title}>
          <ListingImage category="tools" mode={response?.meta.mode??mode} listingUrl={row.listing.url} listingId={row.listing.id} imageUrl={row.listing.imageUrl} imageUrls={row.listing.imageUrls} thumbnailUrl={row.listing.thumbnailUrl} imagePresentation={row.listing.imagePresentation} imageAttributions={row.listing.imageAttributions} synthetic={row.listing.synthetic} title={row.listing.title}/>
          <Text style={styles.body}>{toolCategoryLabels[row.listing.category]} · {powerLabels[row.listing.powerSource]}{row.listing.voltageV===null?'':` · ${row.listing.voltageV} V`}</Text>
          <Text style={styles.body}>{toolClassificationLabels[row.classification]}</Text><Text style={styles.price}>{money(row.listing.priceEur)}</Text>
          {row.price.estimatedMarketPrice!==null&&<Text style={styles.body}>Piață estimată: ~{money(row.price.estimatedMarketPrice)}</Text>}
          {row.price.discountPercent!==null&&<Text style={styles.body}>{discountText(row.price.discountPercent)}</Text>}
          {toolScoreLabels(row).map(label=><Text key={label} style={styles.body}>{label}</Text>)}
          <Text style={styles.body}>Pachet: {toolPackageLabel(row)}</Text><Text style={styles.muted}>📍 {row.listing.locationText} · {distance(row.distanceKm)}</Text>
          <Button title="VEZI DETALII" onPress={()=>{setSelected(row);setStage('details');}}/><ListingAction row={row} mode={response.meta.mode}/>
        </Section>)}
        {response.results.length>10&&<Button title={all?'VEZI TOP 10':`VEZI TOATE CELE ${response.results.length}`} secondary onPress={()=>setAll(v=>!v)}/>}
        <Button title="O NOUĂ CĂUTARE" onPress={()=>setStage('search')}/><Button title="SETĂRI SCULE" secondary onPress={()=>setStage('settings')}/>
      </>:<>
        <Text style={styles.subtitle}>Găsește scule interesante din zona ta.</Text>
        <Text style={styles.muted}>{settings.location} · {settings.radiusKm} km · {money(settings.minPriceEur)}–{money(settings.maxPriceEur)} · {settings.limit} rezultate</Text>
        <Text style={styles.muted}>{settings.categories==='ALL'?'Toate categoriile':settings.categories.map(c=>toolCategoryLabels[c]).join(', ')}</Text>
        {mode==='LIVE'&&<Text style={styles.body}>Sculele sunt disponibile momentan numai în DEMO.</Text>}
        {busy&&<Section><ActivityIndicator/><Text style={styles.body}>{state?.phase==='RECONNECTING'?'Reconectare...':state?.phase==='PAUSED'?'Urmărirea este suspendată.':'AutoHunter caută sculele...'}</Text>
          <Text style={styles.muted}>Poți reveni mai târziu. Căutarea continuă pe PC.</Text></Section>}
        {error&&<Text accessibilityRole="alert" style={styles.body}>{error.title} {error.detail}</Text>}
        <Button title={state?.phase==='PAUSED'?'RECONECTEAZĂ':'🔥 CAUTĂ OFERTE'} disabled={mode==='LIVE'||(busy&&state?.phase!=='PAUSED')}
          onPress={()=>{if(state?.phase==='PAUSED'||state?.searchId)void session.current?.resume();else void session.current?.start(settings);}}/>
        <Button title="SETĂRI SCULE" secondary disabled={busy} onPress={()=>setStage('settings')}/>
      </>}
  </View>;
}
function ToolPrices({row}:{row:ToolResult}){return <Section title="Preț / piață"><Text style={styles.price}>{money(row.listing.priceEur)}</Text>
  {row.price.estimatedMarketPrice!==null?<Fact label="Piață estimată" value={`~${money(row.price.estimatedMarketPrice)}`}/>:<Text style={styles.body}>Piață insuficientă.</Text>}
  {row.price.discountPercent!==null&&<Text style={styles.body}>{discountText(row.price.discountPercent)}</Text>}
  {row.price.potentialSavingEur!==null&&<Fact label="Diferență înainte de costuri" value={money(row.price.potentialSavingEur)}/>}
  <Fact label="Comparabile / încredere" value={`${row.price.comparableCount} / ${row.price.confidence}%`}/></Section>;}
function ListingAction({row,mode}:{row:ToolResult;mode:'DEMO'|'LIVE'|null}){return isDemoTool(row,mode)?<Text style={styles.muted}>ANUNȚ DEMO</Text>:
  <Button title="VEZI ANUNȚUL" secondary onPress={()=>{void openListing(row.listing.url);}}/>;}
