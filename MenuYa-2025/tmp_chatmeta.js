const CHAT_META_START = '\u0002';
const CHAT_META_END = '\u0003';
const CHAT_META_NIBBLE_OFFSET = 0x10;

function encode(text, meta) {
  const json = JSON.stringify(meta);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  let encoded = '';
  for (let i = 0; i < base64.length; i++) {
    const code = base64.charCodeAt(i);
    const high = (code >> 4) & 0xf;
    const low = code & 0xf;
    encoded += String.fromCharCode(CHAT_META_NIBBLE_OFFSET + high);
    encoded += String.fromCharCode(CHAT_META_NIBBLE_OFFSET + low);
  }
  return text + CHAT_META_START + encoded + CHAT_META_END;
}

function decode(raw) {
  const start = raw.lastIndexOf(CHAT_META_START);
  if (start < 0) return null;
  const end = raw.indexOf(CHAT_META_END, start + 1);
  if (end < 0) return null;
  const texto = raw.substring(0, start).trimEnd();
  const block = raw.substring(start + 1, end);
  let result = '';
  for (let i = 0; i < block.length; i += 2) {
    const high = block.charCodeAt(i) - CHAT_META_NIBBLE_OFFSET;
    const low = block.charCodeAt(i + 1) - CHAT_META_NIBBLE_OFFSET;
    const code = (high << 4) | low;
    result += String.fromCharCode(code);
  }
  const meta = JSON.parse(Buffer.from(result, 'base64').toString('utf8'));
  return { texto, meta };
}

const raw = encode('Hola que tal', { version: 1, nombre: 'Juan Perez' });
console.log(raw);
console.log(JSON.stringify(decode(raw), null, 2));
