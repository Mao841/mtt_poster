#!/usr/bin/env node
/**
 * 一键给本机 Vercel CLI 打「非 ASCII 主机名」补丁。
 *
 * 背景：本机 Windows 计算机名是中文（`毛毛的电脑`）。Vercel CLI 会把
 * os.hostname() 拼进 OAuth 请求的 user-agent 头，而非 ASCII 字符会被 Node 的
 * undici 拒绝，导致 `vercel login` / 部分命令直接报错：
 *
 *   TypeError: Cannot convert argument to a ByteString because the character
 *   at index 0 has a value of 27611 which is greater than 255
 *
 * `npx vercel@latest` 每次自动升级都会重新下载一份未打补丁的副本，补丁随之失效。
 * 所以升级后再跑一次本脚本即可：
 *
 *   node tools/patch-vercel-cli.mjs
 *
 * 想一劳永逸：把 Windows 计算机名改成纯英文/数字（例如 MILKTEA-PC），重启后
 * 就不再需要这个补丁了。
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const NEEDLE = 'userAgent=`${hostname()} @ ${ua_default}`';
const PATCHED_MARK = '__dshSafeHostname';
const REPLACEMENT =
  'const __dshForceHostname=process.env.VERCEL_CLI_FORCE_HOSTNAME;' +
  'function __dshSafeHostname(){let h=__dshForceHostname||hostname();' +
  // 回退值必须长得像一台正常主机名：实测 Vercel API 会对 kiosk-pc 这类
  // 异常 user-agent 直接返回 "Not authorized"，而 DESKTOP-xxxxxxx 可以通过。
  "return !/^[\\x00-\\x7F]*$/.test(h)?\"DESKTOP-8K2L9F3\":h}" +
  'var VERCEL_ISSUER=new URL("https://vercel.com"),' +
  'VERCEL_CLI_CLIENT_ID="cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp",' +
  'userAgent=`${__dshSafeHostname()} @ ${ua_default}`';

// 把 `${hostname()} @ ${ua_default}` 整段替换掉（连同前面的 var 声明一起，
// 这样不会留下重复声明）。
const OLD_DECL =
  'var VERCEL_ISSUER=new URL("https://vercel.com"),' +
  'VERCEL_CLI_CLIENT_ID="cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp",' +
  NEEDLE;

function findChunk() {
  const roots = [
    join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx'),
    join(process.env.APPDATA || '', 'npm', 'node_modules'),
    join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx'),
  ].filter(Boolean);

  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries;
    try {
      entries = readdirSync(root).map((n) => join(root, n));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidates = [
        join(entry, 'node_modules', 'vercel', 'dist', 'chunks'),
        join(entry, 'vercel', 'dist', 'chunks'),
      ];
      for (const chunks of candidates) {
        if (!existsSync(chunks)) continue;
        for (const f of readdirSync(chunks)) {
          if (!f.endsWith('.js')) continue;
          const full = join(chunks, f);
          try {
            if (statSync(full).size > 4_000_000) continue;
            const src = readFileSync(full, 'utf8');
            if (src.includes(NEEDLE) || src.includes(PATCHED_MARK)) {
              found.push({ file: full, src });
            }
          } catch {
            /* 忽略读不了的文件 */
          }
        }
      }
    }
  }
  return found;
}

const targets = findChunk();
// 多个搜索根可能命中同一个文件，去重后再报告
const seen = new Set();
const unique = targets.filter((t) => (seen.has(t.file) ? false : (seen.add(t.file), true)));

if (unique.length === 0) {
  console.log('未找到需要打补丁的 Vercel CLI 文件。');
  console.log('可能原因：还没装过 vercel（先跑一次 npx vercel --version），');
  console.log('或者已经升级到不含该代码的版本。');
  process.exit(0);
}

let changed = 0;
for (const { file, src } of unique) {
  if (src.includes(PATCHED_MARK)) {
    console.log('已打过补丁，跳过：' + file);
    continue;
  }
  if (!src.includes(OLD_DECL)) {
    console.log('代码结构与预期不符，跳过（请手动检查）：' + file);
    continue;
  }
  const backup = file + '.dsh-backup';
  if (!existsSync(backup)) copyFileSync(file, backup);
  writeFileSync(file, src.replace(OLD_DECL, REPLACEMENT), 'utf8');
  console.log('已打补丁：' + file);
  console.log('  备份：' + backup);
  changed++;
}

console.log('');
console.log(changed > 0 ? `完成，共处理 ${changed} 个文件。` : '没有需要改动的文件。');
console.log('提示：想彻底摆脱这个补丁，请把 Windows 计算机名改成纯英文并重启。');
