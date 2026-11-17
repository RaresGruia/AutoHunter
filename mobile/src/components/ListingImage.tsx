import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { imageMetadata } from '../../../src/models/ListingImages';
import { listingImagePlan, type ListingImageInput } from '../listingImages';
import {apiBaseUrl} from '../apiBaseUrl';

const labels = { cars: 'Mașini', tractors: 'Tractoare', tools: 'Scule' };
type Props = ListingImageInput & { title: string; large?: boolean };

export function ListingImage(props: Props) {
  const plan = listingImagePlan(props, apiBaseUrl());
  const identity = JSON.stringify([props.category, props.listingId, props.listingUrl, plan]);
  return <ImageContent key={identity} {...props} plan={plan} />;
}

function ImageContent({ category, title, listingId, large = false, plan, imagePresentation, imageAttributions }: Props & { plan: ReturnType<typeof listingImagePlan> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const reject = (uri: string) => setFailed(previous => previous.includes(uri) ? previous : [...previous, uri]);
  const gallery = (plan.uris.length ? plan.uris : plan.thumbnailUri ? [plan.thumbnailUri] : []).filter(uri => !failed.includes(uri));
  const candidates = large ? gallery : [plan.thumbnailUri, ...gallery].filter((uri): uri is string => !!uri && !failed.includes(uri));
  const active = large && selected && gallery.includes(selected) ? selected : candidates[0];
  const metadata = imageMetadata({imagePresentation,imageAttributions});
  const credit = metadata.imageAttributions?.find(item => active?.endsWith(item.imageUrl))
    ?? (active === plan.thumbnailUri ? metadata.imageAttributions?.find(item => plan.uris[0]?.endsWith(item.imageUrl)) : undefined);
  return <View testID={'listing-image-'+listingId} style={local.container}>
    <View style={[local.frame, { maxHeight: large ? 420 : 220 }]}>
      {active ? <Image key={active} source={{ uri: active }} resizeMode="contain"
        accessibilityLabel={'Fotografie: '+title} style={local.image} onError={() => reject(active)} />
        : <View style={local.placeholder}>
          <Text style={local.category}>{labels[category]}</Text>
          <Text style={local.caption}>Fotografie indisponibilă</Text>
        </View>}
    </View>
    {active && metadata.imagePresentation === 'REPRESENTATIVE_MODEL' && <Text style={local.caption}>Fotografie reprezentativă a modelului · nu a produsului din anunț</Text>}
    {active && (large ? metadata.imageAttributions?.filter(item => gallery.some(uri => uri.endsWith(item.imageUrl))) : credit ? [credit] : [])?.map(item =>
      <View key={item.imageUrl} style={local.credit}>
        <Text style={local.creditText}>{item.title} — {item.author}</Text>
        <Text style={local.creditText}>
          <Text accessibilityRole="link" style={local.link} onPress={() => { void Linking.openURL(item.sourceUrl); }}>Sursa fotografiei</Text>
          {' · '}<Text accessibilityRole="link" style={local.link} onPress={() => { void Linking.openURL(item.licenseUrl); }}>{item.license}</Text>
        </Text>
        <Text style={local.creditText}>{item.changes}</Text>
      </View>)}
    {large && gallery.length > 1 && <>
      <Text style={local.caption}>Fotografia {gallery.indexOf(active!)+1} din {gallery.length}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={local.thumbnails}>
        {gallery.map((uri,index) => <Pressable key={uri} accessibilityRole="button"
          accessibilityLabel={'Vezi fotografia '+(index+1)+' din '+gallery.length}
          accessibilityState={{ selected: uri === active }} onPress={() => setSelected(uri)}
          style={[local.thumbnail, uri === active && local.selected]}>
          <Image source={{uri}} resizeMode="cover" accessible={false} style={local.image} onError={() => reject(uri)} />
        </Pressable>)}
      </ScrollView>
    </>}
    {plan.demo && <Text style={local.caption}>ANUNȚ DEMO · date de test</Text>}
  </View>;
}

const local = StyleSheet.create({
  container: { backgroundColor: '#EDF1EE', overflow: 'hidden', borderRadius: 12 },
  frame: { width: '100%', aspectRatio: 3 / 2 },
  image: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  placeholder: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', padding: 12, gap: 8 },
  category: { fontSize: 22, fontWeight: '700', color: '#176343' },
  caption: { color: '#52646B', fontSize: 13, lineHeight: 19, padding: 10, textAlign: 'center' },
  credit: { paddingHorizontal: 10, paddingBottom: 10, gap: 4 },
  creditText: { color: '#52646B', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: '#176343', textDecorationLine: 'underline' },
  thumbnails: { gap: 10, padding: 12 },
  thumbnail: { width: 76, height: 60, borderWidth: 2, borderColor: '#D7E0DB', borderRadius: 8, overflow: 'hidden' },
  selected: { borderColor: '#176343', borderWidth: 3 },
});
