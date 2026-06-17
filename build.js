#!/usr/bin/env node

/**
 * build.js - Build script simples para LibNotify Frontend
 * Minifica JS e copia assets para dist/
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

async function build() {
  console.log('🔨 Iniciando build do frontend...\n');

  // Limpar dist/
  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
    console.log('🗑️  Limpou dist/');
  }

  // Criar estrutura de dist/
  fs.mkdirSync(path.join(distDir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });

  // 1️⃣ Copiar e minificar arquivos JS
  const srcJsDir = path.join(__dirname, 'src', 'js');
  const jsFiles = fs.readdirSync(srcJsDir).filter(f => f.endsWith('.js'));

  for (const file of jsFiles) {
    const srcPath = path.join(srcJsDir, file);
    const code = fs.readFileSync(srcPath, 'utf8');
    
    try {
      const result = await minify(code, {
        compress: { drop_console: true },
        mangle: true,
        output: { comments: false },
      });

      if (result.error) throw result.error;

      const outFile = file.replace('.js', '.min.js');
      fs.writeFileSync(path.join(distDir, 'js', outFile), result.code);
      console.log(`✅ Minificou: ${file} → ${outFile}`);
    } catch (err) {
      console.error(`❌ Erro ao minificar ${file}:`, err.message);
    }
  }

  // 2️⃣ Minificar CSS
  const srcCssDir = path.join(__dirname, 'src', 'css');
  if (fs.existsSync(srcCssDir)) {
    const cssFiles = fs.readdirSync(srcCssDir).filter(f => f.endsWith('.css'));

    for (const file of cssFiles) {
      const srcPath = path.join(srcCssDir, file);
      let css = fs.readFileSync(srcPath, 'utf8');

      // Minificação simples de CSS
      css = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comentários
        .replace(/\s+/g, ' ') // Reduz espaços
        .replace(/\s*([{}:;,])\s*/g, '$1') // Remove espaços ao redor de símbolos
        .trim();

      const outFile = file.replace('.css', '.min.css');
      fs.writeFileSync(path.join(distDir, 'css', outFile), css);
      console.log(`✅ Minificou: ${file} → ${outFile}`);
    }
  }

  // 3️⃣ Copiar HTMLs
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

    for (const file of htmlFiles) {
      const srcPath = path.join(publicDir, file);
      let html = fs.readFileSync(srcPath, 'utf8');

      // Atualizar referências de arquivos para versões minificadas
      html = html
        .replace(/src="([^"]*\/)?([^"]*).js"/g, (match, dir, filename) => {
          const newName = `${dir || ''}${filename}.min.js`;
          return `src="${newName}"`;
        })
        .replace(/href="([^"]*\/)?([^"]*).css"/g, (match, dir, filename) => {
          const newName = `${dir || ''}${filename}.min.css`;
          return `href="${newName}"`;
        });

      fs.writeFileSync(path.join(distDir, file), html);
      console.log(`✅ Copiou: ${file}`);
    }
  }

  // 4️⃣ Copiar assets
  const assetsDir = path.join(publicDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const copyDir = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach(file => {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);
        if (fs.statSync(srcFile).isDirectory()) {
          copyDir(srcFile, destFile);
        } else {
          fs.copyFileSync(srcFile, destFile);
        }
      });
    };

    copyDir(assetsDir, path.join(distDir, 'assets'));
    console.log('✅ Copiou: assets/');
  }

  // 5️⃣ Copiar manifests e service worker
  ['manifest.json', 'manifest-admin.json', 'service-worker.js'].forEach(file => {
    const src = path.join(publicDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(distDir, file));
      console.log(`✅ Copiou: ${file}`);
    }
  });

  console.log('\n✨ Build concluído!');
  console.log(`📦 Arquivos em: ${distDir}`);
  console.log('\n💡 Dica: Rode "npm start" para testar localmente');
}

build().catch(err => {
  console.error('❌ Erro no build:', err);
  process.exit(1);
});
