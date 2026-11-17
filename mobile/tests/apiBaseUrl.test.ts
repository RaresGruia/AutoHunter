import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveApiBaseUrl,browserLoopbackAllowed} from '../src/apiBaseUrl';
test('Local Expo Web follows its actual host after a Wi-Fi address change',()=>{
  assert.equal(resolveApiBaseUrl('http://10.139.99.31:3000','http://localhost:8082/'),'http://localhost:3000');
  assert.equal(resolveApiBaseUrl('http://10.139.99.31:3000','http://10.111.244.207:8082/'),'http://10.111.244.207:3000');
  assert.equal(browserLoopbackAllowed(new URL('http://localhost:3000'),'http://localhost:8082/'),true);
  assert.equal(browserLoopbackAllowed(new URL('http://localhost:3000')),false,'Native tests have no browser location');
  assert.equal(browserLoopbackAllowed(new URL('http://localhost:3000'),'https://public.example.org/'),false);
});
test('Native apps, hosted deployments and explicit remote APIs keep configured addresses',()=>{
  for(const page of [undefined,'https://autohunter.example.org/','http://localhost:45678/'])assert.equal(resolveApiBaseUrl('http://10.1.2.3:3000',page),'http://10.1.2.3:3000');
  assert.equal(resolveApiBaseUrl('https://api.example.org','http://localhost:8082/'),'https://api.example.org');
  assert.equal(resolveApiBaseUrl(undefined,'http://localhost:8082/'),undefined);
});
