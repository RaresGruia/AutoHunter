import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,BackHandler,Text,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SearchSession,type SearchSessionState} from '../searchSession';
import {apiErrorMessage} from '../apiClient';
import {tractorApi} from './api';
import type {TractorResult,TractorSearchResponse,TractorSearchSettings} from './types';
import {DEFAULT_TRACTOR_SETTINGS,loadTractorSettings,tractorJobStorage} from './settings';
import {tractorFacts,tractorLabels} from './display';
import {TractorSettings} from './TractorSettings';
import {money,discountText,distance} from '../display';
import {ListingImage} from '../components/ListingImage';
import {Button,Fact,Section,styles,openListing} from '../ui';

export function TractorScreen({mode,onMode,initialSettings=false}:{mode:'LIVE'|'DEMO'|null;onMode:(mode:'LIVE'|'DEMO')=>void;initialSettings?:boolean}){
  const [settings,setSettings]=useState<TractorSearchSettings>({...DEFAULT_TRACTOR_SETTINGS});
  const [ready,setReady]=useState(false),[notice,setNotice]=useState<string|null>(null);
  const [stage,setStage]=useState<'search'|'settings'|'results'|'details'>(initialSettings?'settings':'search');
  const [state,setState]=useState<SearchSessionState<TractorSearchResponse>|null>(null);
  const [response,setResponse]=useState<TractorSearchResponse|null>(null),[selected,setSelected]=useState<TractorResult|null>(null),[all,setAll]=useState(false);
  const session=useRef<SearchSession<TractorSearchSettings,TractorSearchResponse>|null>(null);
  useEffect(()=>{
    const tracker=new SearchSession<TractorSearchSettings,TractorSearchResponse>(tractorApi,tractorJobStorage(AsyncStorage),next=>{
      setState(next);if(next.storageWarning)setNotice(next.storageWarning);
      if(next.phase==='COMPLETED'&&next.response){setResponse(next.response);onMode(next.response.meta.mode);setAll(false);setStage(current=>current==='settings'?'settings':'results');}
    });session.current=tracker;
    const foreground=()=>{if(AppState.currentState==='active'||AppState.currentState===null)void tracker.resume();else tracker.pause();};
    const subscription=AppState.addEventListener('change',foreground);foreground();
    let active=true;loadTractorSettings(AsyncStorage).then(result=>{if(active){setSettings(result.settings);if(result.recovered)setNotice('Setările tractor au fost recuperate la implicit.');}})
      .catch(()=>{if(active)setNotice('Setările tractor nu au putut fi citite.');}).finally(()=>{if(active)setReady(true);});
    return()=>{active=false;subscription.remove();tracker.dispose();session.current=null;};
  },[onMode]);
  useEffect(()=>{const handler=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(stage==='search')return false;setStage(stage==='details'?'results':'search');return true;
  });return()=>handler.remove();},[stage]);
  const busy=!!state&&['CONNECTING','RUNNING','RECONNECTING','PAUSED'].includes(state.phase);
  const demo=(response?.meta.mode??mode)==='DEMO';
  const error=state?.error?apiErrorMessage(state.error):null;
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>🚜 Tractoare</Text>
    {notice&&<Text style={styles.muted}>{notice}</Text>}
    {!ready?<ActivityIndicator/>:stage==='settings'?<TractorSettings settings={settings} onCancel={()=>setStage('search')} onSaved={next=>{setSettings(next);setNotice('Setările tractor au fost salvate.');setStage('search');}}/>:
      stage==='details'&&selected?<>
        <Section title={selected.listing.title}><ListingImage category="tractors" mode={response?.meta.mode??mode} listingUrl={selected.listing.url} listingId={selected.listing.id} imageUrl={selected.listing.imageUrl} imageUrls={selected.listing.imageUrls} thumbnailUrl={selected.listing.thumbnailUrl} imagePresentation={selected.listing.imagePresentation} imageAttributions={selected.listing.imageAttributions} title={selected.listing.title} large/>{tractorFacts(selected).map(([label,value])=><Fact key={label} label={label} value={value}/>)}</Section>
        <TractorPrices row={selected}/><TractorScores row={selected}/>
        <Section title="Riscuri">{(['mechanical','hydraulic','transmission','cosmetic','legal','data'] as const).map(key=><Fact key={key} label={riskLabels[key]} value={`${selected.risks[key]}/100`}/>)}</Section>
        <Section title="De ce este interesant">{selected.positiveReasons.map((reason,i)=><Text key={i} style={styles.body}>{reason}</Text>)}</Section>
        <Section title="Calitate">{selected.qualityReasons.map((reason,i)=><Text key={i} style={styles.body}>{reason}</Text>)}</Section>
        <Section title="De verificat">{selected.warnings.map((warning,i)=><Text key={i} style={styles.body}>• {warning}</Text>)}</Section>
        <Text style={styles.body}>📍 {selected.listing.locationText} · {distance(selected.distanceKm)}</Text>
        <ListingAction row={selected} demo={demo}/><Button title="ÎNAPOI LA REZULTATE" secondary onPress={()=>setStage('results')}/>
      </>:stage==='results'&&response?<>
        {response.meta.warnings.filter(warning=>!warning.startsWith('Mod demonstrație:')).map((warning,i)=><Text key={i} style={styles.muted}>{warning}</Text>)}
        <Text style={styles.subtitle}>{response.results.length} rezultate · {response.meta.location} · {response.meta.radiusKm} km</Text>
        {response.results.length===0&&<Text style={styles.body}>Nu sunt tractoare care să corespundă filtrelor.</Text>}
        {(all?response.results:response.results.slice(0,10)).map(row=><Section key={row.listing.id} title={row.listing.title}>
          <ListingImage category="tractors" mode={response?.meta.mode??mode} listingUrl={row.listing.url} listingId={row.listing.id} imageUrl={row.listing.imageUrl} imageUrls={row.listing.imageUrls} thumbnailUrl={row.listing.thumbnailUrl} imagePresentation={row.listing.imagePresentation} imageAttributions={row.listing.imageAttributions} title={row.listing.title}/>
          <Text style={styles.body}>{tractorLabels[row.classification]}</Text>
          <Text style={styles.price}>{money(row.listing.priceEur)}</Text>
          {row.price.estimatedMarketEur!==null&&<Text style={styles.body}>Piață: ~{money(row.price.estimatedMarketEur)}</Text>}
          {row.price.discountPercent!==null&&<Text style={styles.body}>{discountText(row.price.discountPercent)}</Text>}
          <Text style={styles.body}>🔥 Deal: {row.scores.deal} · 🚜 Quality: {row.scores.tractorQuality} · 💰 Flip: {row.scores.flipPotential}</Text>
          {tractorFacts(row).filter(([label])=>['An','Putere','Ore','Tracțiune'].includes(label)).map(([label,value])=><Fact key={label} label={label} value={value}/>)}
          <Text style={styles.muted}>📍 {row.listing.locationText} · {distance(row.distanceKm)}</Text>
          <Button title="VEZI DETALII" onPress={()=>{setSelected(row);setStage('details');}}/><ListingAction row={row} demo={demo}/>
        </Section>)}
        {response.results.length>10&&<Button title={all?'VEZI TOP 10':`VEZI TOATE CELE ${response.results.length}`} onPress={()=>setAll(v=>!v)} secondary/>}
        <Button title="O NOUĂ CĂUTARE" onPress={()=>setStage('search')}/><Button title="SETĂRI TRACTOARE" secondary onPress={()=>setStage('settings')}/>
      </>:<>
        <Text style={styles.subtitle}>Găsește tractoare interesante din zona ta.</Text>
        <Text style={styles.muted}>{settings.location} · {settings.radiusKm} km · {money(settings.minPriceEur)}–{money(settings.maxPriceEur)} · {settings.limit} rezultate</Text>
        {mode==='LIVE'&&<Text style={styles.body}>Tractoarele sunt disponibile momentan numai în DEMO.</Text>}
        {busy&&<Section><ActivityIndicator/><Text style={styles.body}>{state?.phase==='RECONNECTING'?'Reconectare...':state?.phase==='PAUSED'?'Urmărirea este suspendată.':'AutoHunter caută tractoarele...'}</Text>
          <Text style={styles.muted}>Poți reveni mai târziu. Căutarea continuă pe PC.</Text></Section>}
        {error&&<Text accessibilityRole="alert" style={styles.body}>{error.title} {error.detail}</Text>}
        <Button title={state?.phase==='PAUSED'?'RECONECTEAZĂ':'🔥 CAUTĂ OFERTE'} disabled={mode==='LIVE'||(busy&&state?.phase!=='PAUSED')}
          onPress={()=>{if(state?.phase==='PAUSED'||state?.searchId)void session.current?.resume();else void session.current?.start(settings);}}/>
        <Button title="SETĂRI TRACTOARE" secondary disabled={busy} onPress={()=>setStage('settings')}/>
      </>}
  </View>;
}
const riskLabels={mechanical:'Mecanic',hydraulic:'Hidraulic',transmission:'Transmisie',cosmetic:'Cosmetic',legal:'Acte',data:'Date'};
function TractorPrices({row}:{row:TractorResult}){return <Section title="Preț / piață"><Text style={styles.price}>{money(row.listing.priceEur)}</Text>
  {row.price.estimatedMarketEur!==null?<Fact label="Piață estimată" value={`~${money(row.price.estimatedMarketEur)}`}/>:<Text style={styles.body}>Piață insuficientă.</Text>}
  {row.price.discountPercent!==null&&<Text style={styles.body}>{discountText(row.price.discountPercent)}</Text>}
  {row.price.potentialSavingEur!==null&&<Fact label="Diferență înainte de costuri" value={money(row.price.potentialSavingEur)}/>}
  <Fact label="Comparabile / încredere" value={`${row.price.comparableCount} / ${row.price.confidence}%`}/></Section>;}
function TractorScores({row}:{row:TractorResult}){return <Section title={tractorLabels[row.classification]}>
  <Fact label="🔥 Deal" value={`${row.scores.deal}/100`}/><Fact label="🚜 Quality" value={`${row.scores.tractorQuality}/100`}/>
  <Fact label="💰 Flip" value={`${row.scores.flipPotential}/100`}/><Fact label="Opportunity" value={`${row.scores.opportunity}/100`}/></Section>;}
function ListingAction({row,demo}:{row:TractorResult;demo:boolean}){return demo||row.listing.url.includes('example.invalid')?<Text style={styles.muted}>ANUNȚ DEMO — nu este o ofertă reală</Text>:
  <Button title="VEZI ANUNȚUL" secondary onPress={()=>{void openListing(row.listing.url);}}/>;}
