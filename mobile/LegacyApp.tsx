import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, apiErrorMessage } from './src/apiClient';
import { SearchSession, type SearchSessionState } from './src/searchSession';
import { DEFAULT_SETTINGS, loadSettings } from './src/settings';
import type { CarSearchRequest, CarSearchResponse, CarSearchResult } from './src/types';
import { Button, colors, styles } from './src/ui';
import { TractorScreen } from './src/tractors/TractorScreen';
import { TRACTOR_SEARCH_KEY } from './src/tractors/settings';
import { ToolsScreen } from './src/tools/ToolsScreen';
import { TOOL_SEARCH_KEY } from './src/tools/settings';
import { HomeScreen } from './src/screens/HomeScreen';
import { CarsScreen } from './src/screens/CarsScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { DetailsScreen } from './src/screens/DetailsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import {LiveScreen} from './src/live/LiveScreen';

type Screen = 'home' | 'cars' | 'results' | 'details' | 'settings' | 'tractors' | 'tools';
export default function App() {
  const [experience,setExperience]=useState<'DEMO'|'LIVE'>('LIVE');
  const [screen, setScreen] = useState<Screen>('home');
  const activeCategory=useRef<'cars'|'tractors'|'tools'>('cars');
  const [mode,setMode]=useState<'LIVE'|'DEMO'|null>(null);
  const [tractorSettingsFirst,setTractorSettingsFirst]=useState(false);
  const [toolSettingsFirst,setToolSettingsFirst]=useState(false);
  function openTools(settingsFirst=false){activeCategory.current='tools';setToolSettingsFirst(settingsFirst);setScreen('tools');}
  function openTractors(settingsFirst=false){activeCategory.current='tractors';setTractorSettingsFirst(settingsFirst);setScreen('tractors');}
  useEffect(()=>{let active=true;void apiClient.getMode().then(value=>{if(active)setMode(value);}).catch(()=>{});
    void Promise.all([AsyncStorage.getItem(TOOL_SEARCH_KEY),AsyncStorage.getItem(TRACTOR_SEARCH_KEY)]).then(([toolId,tractorId])=>{if(!active)return;if(toolId)openTools();else if(tractorId)openTractors();}).catch(()=>{});
    return()=>{active=false;};},[]);
  const [settingsReturn, setSettingsReturn] = useState<Screen>('home');
  const [settings, setSettings] = useState<CarSearchRequest>({ ...DEFAULT_SETTINGS });
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ReturnType<typeof apiErrorMessage> | null>(null);
  const [response, setResponse] = useState<CarSearchResponse | null>(null);
  const [selected, setSelected] = useState<CarSearchResult | null>(null);
  const session = useRef<SearchSession | null>(null);
  const [jobState, setJobState] = useState<SearchSessionState | null>(null);
  useEffect(() => {
    const tracker = new SearchSession(apiClient, AsyncStorage, state => {
      setJobState(state);
      setBusy(['CONNECTING', 'RUNNING', 'RECONNECTING', 'PAUSED'].includes(state.phase));
      if (state.storageWarning) setNotice(state.storageWarning);
      if (state.response?.meta.mode) setMode(state.response.meta.mode);
      if (state.phase === 'COMPLETED' && state.response) setResponse(state.response);
      if (activeCategory.current!=='cars') return;
      if (state.phase === 'COMPLETED' && state.response) { setResponse(state.response); setError(null); setScreen('results'); }
      else if (state.phase === 'FAILED' || state.phase === 'ERROR') { setError(apiErrorMessage(state.error)); setScreen('cars'); }
      else if (['RUNNING', 'RECONNECTING', 'PAUSED'].includes(state.phase)) { setError(null); setScreen('cars'); }
    });
    session.current = tracker;
    const foreground = () => { if (AppState.currentState === 'active' || AppState.currentState === null) void tracker.resume(); else tracker.pause(); };
    const subscription = AppState.addEventListener('change', foreground);
    foreground();
    return () => { subscription.remove(); tracker.dispose(); session.current = null; };
  }, []);
  useEffect(() => {
    let active = true;
    loadSettings(AsyncStorage).then(result => {
      if (!active) return;
      setSettings(result.settings);
      if (result.recovered) setNotice('Setările salvate nu au putut fi citite. Folosim valorile implicite.');
    }).catch(() => { if (active) setNotice('Memoria telefonului nu a putut fi citită. Folosim setările implicite.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  function back(): boolean {
    if(experience==='LIVE')return false;
    if(screen==='tractors'||screen==='tools'){activeCategory.current='cars';setScreen('home');return true;}
    if (busy || saving) return true;
    if (screen === 'home') return false;
    setScreen(screen === 'details' ? 'results' : screen === 'results' ? 'cars' : screen === 'settings' ? settingsReturn : 'home');
    return true;
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', back);
    return () => subscription.remove();
  }, [screen, settingsReturn, busy, saving,experience]);
  const openSettings = () => { setSettingsReturn(screen); setScreen('settings'); };
  async function search() {
    if (!ready) return;
    setError(null); setScreen('cars');
    if (jobState?.phase === 'PAUSED' || jobState?.searchId) await session.current?.resume();
    else await session.current?.start(settings);
  }
  return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
    <StatusBar style="dark" />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {experience==='LIVE'?<LiveScreen onDemo={()=>setExperience('DEMO')}/>:<View style={{ flex: 1, width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={{flexDirection:'row',gap:8,padding:12}}>
          <Button title="DEMO" secondary={experience!=='DEMO'} onPress={()=>setExperience('DEMO')}/>
          <Button title="LIVE" secondary onPress={()=>setExperience('LIVE')}/>
        </View>
        {experience==='DEMO'&&mode==='DEMO'&&<Text style={[styles.muted,{paddingHorizontal:20,paddingVertical:8}]}>MOD DEMONSTRAȚIE — date sintetice</Text>}
        {experience==='DEMO'&&screen !== 'home' && <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line }}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: (screen !== 'tractors' && screen !== 'tools' && busy) || saving }} disabled={(screen !== 'tractors' && screen !== 'tools' && busy) || saving}
            onPress={back} style={{ minHeight: 48, justifyContent: 'center', opacity: (screen !== 'tractors' && screen !== 'tools' && busy) || saving ? 0.4 : 1 }}>
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 18 }}>‹ Înapoi</Text>
          </Pressable>
        </View>}
        {!ready ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}><ActivityIndicator color={colors.green} size="large" /><Text style={styles.body}>Deschidem AutoHunter...</Text></View> :
          <ScrollView key={screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
            {notice && <Pressable accessibilityRole="button" accessibilityLabel={`${notice} Închide mesajul`} onPress={() => setNotice(null)} style={[styles.warning, { margin: 20 }]}><Text style={styles.body}>{notice}</Text><Text style={styles.muted}>Apasă pentru a închide</Text></Pressable>}
            {screen === 'home' && <HomeScreen onCars={() => {activeCategory.current='cars';setScreen('cars');}} onSettings={openSettings} onTractors={()=>openTractors()} onTools={()=>openTools()} />}
            {screen === 'tools' && <ToolsScreen mode={mode} onMode={setMode} initialSettings={toolSettingsFirst}/>}
            {screen === 'tractors' && <TractorScreen mode={mode} onMode={setMode} initialSettings={tractorSettingsFirst}/>}
            {screen === 'cars' && <CarsScreen settings={settings} busy={busy} jobState={jobState} error={error} onSearch={() => { void search(); }} onSettings={openSettings} />}
            {screen === 'results' && response && <ResultsScreen response={response} onDetails={car => { setSelected(car); setScreen('details'); }} onSettings={openSettings} onSearch={() => setScreen('cars')} />}
            {screen === 'details' && selected && <DetailsScreen car={selected} mode={response?.meta.mode ?? mode} />}
            {screen === 'settings' && <><Button title="SCULE — SETĂRI" secondary disabled={saving} onPress={()=>openTools(true)}/><Button title="TRACTOARE — SETĂRI" secondary disabled={saving} onPress={()=>openTractors(true)}/><SettingsScreen settings={settings} onSaving={setSaving} onSaved={next => {
              setSettings(next); setNotice('Setările au fost salvate.'); setScreen(settingsReturn === 'home' ? 'home' : 'cars'); setError(null);
            }} /></>}
          </ScrollView>}
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView></SafeAreaProvider>;
}
