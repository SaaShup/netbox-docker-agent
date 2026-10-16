import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { generateKeyPairSync, createECDH, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicKey, AuthorizedKeys } from '../../src/ssh-keys.js';

const string = value => { const data = Buffer.from(value), length = Buffer.alloc(4); length.writeUInt32BE(data.length); return Buffer.concat([length, data]); };
const wire = (type, ...fields) => `${type} ${Buffer.concat([type, ...fields].map(string)).toString('base64')}`;
const ed = Buffer.alloc(32, 17), key = wire('ssh-ed25519', ed), other = wire('ssh-ed25519', Buffer.alloc(32, 23));
const hash = value => createHash('sha256').update(value).digest('hex');
async function setup(t, text = '') {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'nda-ssh-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'authorized_keys'), backups = path.join(directory, 'backups');
  await fs.writeFile(file, text, { mode: 0o600 });
  return { directory, file, backups, keys: new AuthorizedKeys(file, backups) };
}

test('OpenSSH validation accepts real supported algorithms and matches SHA256 fingerprints', () => {
  const parsed = publicKey(`${key} laptop`);
  assert.equal(parsed.comment, 'laptop'); assert.equal(parsed.type, 'ssh-ed25519');
  assert.equal(parsed.fingerprint, 'SHA256:' + createHash('sha256').update(Buffer.concat([string('ssh-ed25519'), string(ed)])).digest('base64').replace(/=+$/, ''));
  assert.equal(publicKey(key).comment, '');
  for (const [curve, name] of [['prime256v1', 'nistp256'], ['secp384r1', 'nistp384'], ['secp521r1', 'nistp521']]) {
    const ec = createECDH(curve); ec.generateKeys();
    assert.equal(publicKey(wire(`ecdsa-sha2-${name}`, name, ec.getPublicKey())).type, `ecdsa-sha2-${name}`);
  }
  const { publicKey: rsa } = generateKeyPairSync('rsa', { modulusLength: 2048 }); const jwk = rsa.export({ format: 'jwk' });
  const n = Buffer.from(jwk.n, 'base64url'), e = Buffer.from(jwk.e, 'base64url');
  assert.equal(publicKey(wire('ssh-rsa', e, Buffer.concat([Buffer.from([0]), n]))).type, 'ssh-rsa');
});

test('OpenSSH validation rejects private keys, options, injection, malformed wire data and weak RSA', () => {
  for (const invalid of [null, '', 'x'.repeat(16385), key+'\n'+other, key+'\0', '-----BEGIN OPENSSH PRIVATE KEY-----', `command="id" ${key}`, 'ssh-dss AAAA', 'ssh-ed25519 !!!', 'ssh-ed25519 AAAA', wire('ssh-ed25519', Buffer.alloc(31)), wire('ssh-ed25519', ed, 'trailing'), wire('ssh-rsa', Buffer.alloc(0), 'n'), wire('ssh-rsa', Buffer.from([128]), 'n'), wire('ssh-rsa', Buffer.from([0]), 'n'), wire('ssh-rsa', Buffer.from([0, 3]), 'n'), wire('ssh-rsa', Buffer.from([3]), Buffer.from([1])), wire('ecdsa-sha2-nistp256', 'nistp384', Buffer.alloc(65)), wire('ecdsa-sha2-nistp256', 'nistp256', Buffer.alloc(65)), wire('ecdsa-sha2-nistp256', 'nistp256', Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]))]) {
    assert.throws(() => publicKey(invalid), { statusCode: 400 }, String(invalid));
  }
  const mismatched = Buffer.concat([string('ssh-rsa'), string(ed)]).toString('base64');
  assert.throws(() => publicKey(`ssh-ed25519 ${mismatched}`), { statusCode: 400 });
  assert.throws(() => publicKey('ssh-ed25519 AAAAA////w=='), { statusCode: 400 });
  assert.throws(() => publicKey('ssh-ed25519 AAAAB3NzaC1lZDI1NTE5'), { statusCode: 400 });
  const weak = wire('ssh-rsa', Buffer.from([3]), Buffer.concat([Buffer.from([0]),Buffer.alloc(128, 255)]));
  assert.throws(() => publicKey(weak), { statusCode: 400 });
  for (const e of [1, 2, 4]) assert.throws(() => publicKey(wire('ssh-rsa', Buffer.from([e]), Buffer.concat([Buffer.from([0]),Buffer.alloc(256, 255)]))), { statusCode: 400 });
});


test('listing preserves comments, restrictions, unsupported lines and CRLF', async t => {
  const text=`# ${key}\r\n\r\ncommand="echo hello world",no-pty ${key}\towner\r\nunsupported entry\nssh-dss AAAA old\nx y ${other}\n${other} regular\n`;
  const {keys,file,backups}=await setup(t,text), listed=await keys.list();
  assert.equal(listed.account,'Host account');assert.equal(listed.keys.length,2);assert.equal(listed.keys[0].comment,'owner');assert.match(listed.keys[0].options,/no-pty/);
  assert.equal(await fs.readFile(file,'utf8'),text);
  assert.equal((await new AuthorizedKeys(file,backups,'hostuser').list()).account,'hostuser');
});

test('in-place add/remove preserves inode and metadata and saves exact private backups separately',async t=>{
  const text=`# retain\r\nrestrict ${key} first\r\nunknown`,{keys,file,backups}=await setup(t,text);
  await fs.chmod(file,0o640);const before=await fs.stat(file);let current=await keys.list();
  await assert.rejects(keys.change('POST',{publicKey:key,revision:current.revision}),{statusCode:409});
  const added=await keys.change('POST',{publicKey:`${other} second`,revision:current.revision});
  assert.equal(await fs.readFile(path.join(backups,added.backup),'utf8'),text);assert.equal((await fs.stat(path.join(backups,added.backup))).mode&0o777,0o600);
  const after=await fs.stat(file);for(const field of ['ino','uid','gid','mode'])assert.equal(after[field],before[field]);
  assert.equal(await fs.readFile(file,'utf8'),text+'\n'+other+' second\n');
  await assert.rejects(keys.change('DELETE',{id:current.keys[0].id,revision:current.revision}),{statusCode:409});
  current=await keys.list();const removed=await keys.change('DELETE',{id:current.keys[1].id,revision:current.revision});
  assert.equal(await fs.readFile(file,'utf8'),text+'\n');
  assert.equal(await fs.readFile(path.join(backups,removed.backup),'utf8'),text+'\n'+other+' second\n');
  await assert.rejects(keys.change('DELETE',{id:'0'.repeat(64),revision:removed.revision}),{statusCode:404});
});

test('empty files, duplicate lines and removing the last key retain the same file',async t=>{
  const {keys,file}=await setup(t);assert.deepEqual((await keys.list()).keys,[]);const ino=(await fs.stat(file)).ino;
  await keys.change('POST',{publicKey:key,revision:(await keys.list()).revision});
  await fs.writeFile(file,key+'\n'+key+'\n');let current=await keys.list();assert.notEqual(current.keys[0].id,current.keys[1].id);
  await keys.change('DELETE',{id:current.keys[0].id,revision:current.revision});assert.equal(await fs.readFile(file,'utf8'),key+'\n');
  current=await keys.list();await keys.change('DELETE',{id:current.keys[0].id,revision:current.revision});
  assert.equal(await fs.readFile(file,'utf8'),'');assert.equal((await fs.stat(file)).ino,ino);
});

test('invalid fields, paths, revisions and IDs never modify the file',async t=>{
  const {keys,file}=await setup(t);
  for(const input of [null,[],'bad',{}, {revision:'bad'},{revision:[hash('')]},{revision:hash(''),path:'/etc/passwd'}])await assert.rejects(keys.change('POST',input),{statusCode:400});
  for(const id of ['bad',[hash('')]])await assert.rejects(keys.change('DELETE',{id,revision:hash('')}),{statusCode:400});
  assert.equal(await fs.readFile(file,'utf8'),'');
});

test('missing, symlinked, hardlinked, nonregular and unsafe files are rejected',async t=>{
  const {keys,file,directory}=await setup(t,key);
  await fs.chmod(file,0o622);await assert.rejects(keys.list(),{statusCode:409});await fs.chmod(file,0o600);
  await fs.link(file,path.join(directory,'hardlink'));await assert.rejects(keys.list(),{statusCode:409});await fs.rm(path.join(directory,'hardlink'));
  await fs.rename(file,path.join(directory,'saved'));await fs.symlink(path.join(directory,'saved'),file);await assert.rejects(keys.list(),{code:'ELOOP'});await fs.rm(file);
  await fs.mkdir(file);await assert.rejects(keys.list(),{statusCode:409});await fs.rmdir(file);await assert.rejects(keys.list(),{code:'ENOENT'});
  await fs.writeFile(file,Buffer.from([255]),{mode:0o600});await assert.rejects(keys.list(),{statusCode:413});
  await fs.writeFile(file,'x'.repeat(1024*1024+1));await assert.rejects(keys.list(),{statusCode:413});
});

test('oversized additions and truncated SSH fields fail before any live write',async t=>{
  const broken=Buffer.alloc(4);broken.writeUInt32BE(1000);assert.throws(()=>publicKey('ssh-ed25519 '+broken.toString('base64')),{statusCode:400});
  const {keys,file}=await setup(t,'#'+'x'.repeat(1024*1024-1));
  await assert.rejects(keys.change('POST',{publicKey:key,revision:(await keys.list()).revision}),{statusCode:413});assert.equal((await fs.stat(file)).size,1024*1024);
});

test('unsafe backup directories and incorrect file ownership are rejected',async t=>{
  const {keys,file,backups,directory}=await setup(t,key);
  await fs.mkdir(backups,{mode:0o777});await fs.chmod(backups,0o777);await assert.rejects(keys.openBackups(),{statusCode:409});await fs.rmdir(backups);
  await fs.symlink(directory,backups);await assert.rejects(keys.openBackups(),{statusCode:409});await fs.rm(backups);
  const uid=process.getuid();t.mock.method(process,'getuid',()=>uid+1);
  await assert.rejects(keys.list(),{statusCode:409});await assert.rejects(keys.openBackups(),{statusCode:409});
  assert.equal(await fs.readFile(file,'utf8'),key);
});

test('lock contention, lock permission errors and backup failures preserve live contents',async t=>{
  const {keys,file,backups}=await setup(t,key+'\n');await fs.mkdir(backups,{mode:0o700});const lock=path.join(backups,'.authorized_keys.agent.lock');
  const input={publicKey:other,revision:(await keys.list()).revision};
  await fs.mkdir(lock);await assert.rejects(keys.change('POST',input),{statusCode:409});await fs.rmdir(lock);
  const mkdir=fs.mkdir;const mock=t.mock.method(fs,'mkdir',async(...args)=>{if(String(args[0]).endsWith('.agent.lock'))throw Error('lock denied');return mkdir(...args);});
  await assert.rejects(keys.change('POST',input),/lock denied/);mock.mock.restore();
  keys.backup=async()=>{throw Error('disk full');};await assert.rejects(keys.change('POST',input),/disk full/);
  assert.equal(await fs.readFile(file,'utf8'),key+'\n');assert.equal((await fs.readdir(backups)).includes('.authorized_keys.agent.lock'),false);
});

test('external content changes and path replacement before writing are rejected',async t=>{
  const {keys,file}=await setup(t,key+'\n');const backup=keys.backup.bind(keys);
  keys.backup=async(...args)=>{await backup(...args);await fs.writeFile(file,'# external\n');};
  await assert.rejects(keys.change('POST',{publicKey:other,revision:(await keys.list()).revision}),{statusCode:409});assert.equal(await fs.readFile(file,'utf8'),'# external\n');
  keys.backup=async(...args)=>{await backup(...args);const text=await fs.readFile(file);await fs.rename(file,file+'.old');await fs.writeFile(file,text,{mode:0o600});};
  await assert.rejects(keys.change('POST',{publicKey:other,revision:(await keys.list()).revision}),{statusCode:409});
});

test('short writes are completed and a failed write restores the original through the same inode',async t=>{
  const {keys,file,backups}=await setup(t,key+'\n'),before=await fs.stat(file),input={publicKey:other,revision:(await keys.list()).revision};
  const originalOpen=keys.open.bind(keys);let injected=false;
  keys.open=async writable=>{const handle=await originalOpen(writable);if(writable){const write=handle.write.bind(handle);handle.write=async(buffer,offset,length,position)=>{
    if(!injected){injected=true;await write(buffer,offset,5,position);throw Error('write interrupted');}return write(buffer,offset,Math.min(length,7),position);
  };}return handle;};
  await assert.rejects(keys.change('POST',input),/write interrupted/);assert.equal(await fs.readFile(file,'utf8'),key+'\n');assert.equal((await fs.stat(file)).ino,before.ino);
  keys.open=originalOpen;await keys.change('POST',input);assert.match(await fs.readFile(file,'utf8'),/ssh-ed25519/);
  assert.equal((await fs.readdir(backups)).includes('.authorized_keys.agent.lock'),false);
});

test('failed recovery reports the retained backup and releases the lock',async t=>{
  const {keys,file,backups}=await setup(t,key+'\n');keys.write=async()=>{throw Error('I/O failure');};
  await assert.rejects(keys.change('POST',{publicKey:other,revision:(await keys.list()).revision}),error=>error.statusCode===500&&/restore backup/.test(error.message));
  const names=await fs.readdir(backups);assert.equal(names.includes('.authorized_keys.agent.lock'),false);
  assert.equal(await fs.readFile(path.join(backups,names[0]),'utf8'),key+'\n');assert.equal(await fs.readFile(file,'utf8'),key+'\n');
});

test('a write that makes no progress fails safely, and failed backup handles are closed',async t=>{
  const {keys,file}=await setup(t,key),handle=await fs.open(file,'r+');t.after(()=>handle.close());
  t.mock.method(handle,'write',async()=>({bytesWritten:0}));await assert.rejects(keys.write(handle,other),/no progress/);
  const open=fs.open;let closed=false;
  t.mock.method(fs,'open',async(...args)=>{const f=await open(...args);if(args[1]==='wx'){const close=f.close.bind(f);f.writeFile=async()=>{throw Error('backup write failed');};f.close=async()=>{closed=true;await close();};}return f;});
  await assert.rejects(keys.backup(file+'.backup',key),/backup write failed/);assert.equal(closed,true);
});

for(const failure of ['truncate','sync'])test(`failed ${failure} restores the original contents and preserves inode`,async t=>{
  const {keys,file}=await setup(t,key+'\n'),before=await fs.stat(file),open=keys.open.bind(keys);let injected=false;
  keys.open=async writable=>{const handle=await open(writable);if(writable){const operation=handle[failure].bind(handle);handle[failure]=async(...args)=>{if(!injected){injected=true;throw Error(`${failure} failed`);}return operation(...args);};}return handle;};
  await assert.rejects(keys.change('POST',{publicKey:other,revision:(await keys.list()).revision}),new RegExp(`${failure} failed`));
  assert.equal(await fs.readFile(file,'utf8'),key+'\n');assert.equal((await fs.stat(file)).ino,before.ino);
});

test('a file growing after stat cannot bypass the read size limit',async t=>{
  const {keys,file}=await setup(t),handle=await keys.open();t.after(()=>handle.close());const stat=handle.stat.bind(handle);
  t.mock.method(handle,'stat',async()=>{const previous=await stat();await fs.writeFile(file,'x'.repeat(1024*1024+1));return previous;});
  await assert.rejects(keys.snapshot(handle),{statusCode:413});
});
