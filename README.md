# SorrisMed — Site de captação de pacientes

Site da **SorrisMed — Clínica Médica e Odontológica** (Rod. Armando Calil Bulos, 6100 — Ingleses Norte, Florianópolis/SC), focado em conversão: cada seção leva o visitante a falar com a clínica pelo WhatsApp ou a deixar o contato no formulário.

## O que tem no site

| Seção | Objetivo de conversão |
|---|---|
| Hero com nota 5,0 / 681 avaliações | Prova social logo no início + CTA principal de WhatsApp |
| Faixa de confiança | Números que geram credibilidade |
| Tratamentos (8 cards) | Cada card abre o WhatsApp com mensagem pronta sobre aquele tratamento |
| Por que a SorrisMed + foto da fachada | Diferenciais extraídos das avaliações reais (recepção, explicação das etapas, financeiro) |
| Como funciona (4 passos) | Reduz a ansiedade de quem nunca foi à clínica |
| Avaliações do Google | Depoimentos reais + link para o perfil no Google |
| Formulário de agendamento | Captura nome, WhatsApp, interesse e período, com consentimento LGPD |
| Dúvidas frequentes | Quebra objeções |
| Como chegar | Endereço, horário, rota e mapa (carregado só no clique, deixa a página mais leve) |
| Botão flutuante + barra fixa no celular | WhatsApp e ligação sempre a um toque |

Também inclui: SEO local (metatags e dados estruturados `Dentist`/`MedicalClinic`), imagem de compartilhamento para WhatsApp e redes (`og-sorrismed.jpg`), favicon e ícones, página de Política de Privacidade (LGPD), página 404, acessibilidade (navegação por teclado e `prefers-reduced-motion`) e eventos de conversão prontos para GA4, GTM e Meta Pixel.

## Logo

A logo foi **vetorizada** a partir da foto da recepção: letras convertidas em curvas, linha de batimento em vermelho formando o "M" e o sorriso verde em forma de seta. Está na pasta `brand/`:

- `logo-sorrismed.svg` / `.png` — versão colorida (fundo transparente)
- `logo-sorrismed-branco.svg` / `.png` — versão para fundos escuros
- `favicon.svg` — ícone (batimento + sorriso)
- `gerar-logo.py` — script que gera a logo (requer `fonttools` e a fonte Poppins)

Cores da marca: verde `#0E5A47`, vermelho `#D7262E` e verde-claro `#43A637`.

> Se a clínica tiver o arquivo original da logo (AI, PDF ou SVG do designer), basta substituir `public/assets/img/logo-sorrismed.svg` e `logo-sorrismed-branco.svg`.

## Como rodar

Requer Node.js 18.17 ou mais recente. Não há dependências para instalar.

```bash
cp .env.example .env        # ajuste as variáveis
npm start                   # http://localhost:3000
npm test                    # testes do backend
```

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `ADMIN_TOKEN` | Senha para baixar os leads em `/api/leads.csv` |
| `LEAD_WEBHOOK_URL` | (Opcional) Envia cada lead para Zapier, Make, n8n, RD Station, planilha etc. |
| `TRUST_PROXY` | Use `1` atrás de proxy/CDN para o limitador de envios ler o IP real |
| `LEADS_FILE` | Arquivo onde os leads são gravados (padrão `data/leads.jsonl`) |

## Backend (API)

- `POST /api/leads` — valida os dados, filtra robôs (campo isca + tempo mínimo de preenchimento), limita a 5 envios a cada 10 minutos por IP, grava em `data/leads.jsonl` e repassa ao webhook, se configurado.
- `GET /api/leads.csv` — exporta os leads em CSV para Excel ou Google Sheets. Acesse pelo navegador: ele vai pedir usuário e senha (o usuário pode ser qualquer um; a senha é o `ADMIN_TOKEN`).
- `GET /api/health` — verificação de saúde para o provedor de hospedagem.

Também serve os arquivos de `public/` com gzip, cache e cabeçalhos de segurança (CSP etc.).

**Sem backend?** A pasta `public/` funciona sozinha em hospedagem estática (Netlify, Vercel, GitHub Pages, Hostinger). Nesse caso o formulário detecta que a API não existe e envia o lead pelo WhatsApp, com a mensagem já preenchida.

## Hospedagem sugerida

- **Com backend:** Render, Railway, Fly.io ou uma VPS (`npm start`). Use disco persistente para a pasta `data/`, ou configure o `LEAD_WEBHOOK_URL` para não depender do disco.
- **Só estático:** publique a pasta `public/`.

## ⚠️ Antes de publicar: confirmar com a clínica

1. **Responsável técnico (obrigatório pelo CFO/CFM):** no rodapé de `public/index.html`, troque `Dr(a). NOME COMPLETO — CRO/SC 00000` (e o CRM, se houver atendimento médico) pelos dados reais. A Resolução CFO 196/2019 exige essas informações em toda publicidade odontológica.
2. **Horário de funcionamento:** o Google Maps mostrava "fecha às 18h". Usei *segunda a sexta, 08h às 18h*. Ajuste em `index.html` (topo, FAQ, seção "Como chegar" e JSON-LD) e em `CONFIG.hours`, no início de `public/assets/js/main.js`, que controla o selo "Aberto agora".
3. **Tratamentos oferecidos:** confirme a lista dos 8 cards e do campo "Tenho interesse em". Se mudar alguma opção, atualize também a lista `INTERESSES` em `lib/leads.js`.
4. **Domínio:** quando houver domínio, troque os caminhos relativos de `og:image` e do JSON-LD por URLs absolutas (ex.: `https://www.sorrismed.com.br/assets/img/og-sorrismed.jpg`) e adicione `<link rel="canonical">`.
5. **Publicidade em saúde:** o site evita preços, promoções e fotos de "antes e depois", que são restritos pelo código de ética do CFO. Mantenha esse cuidado ao editar os textos.

## Rastreamento de conversões

O `main.js` já envia eventos para `dataLayer` (GTM), `gtag` (GA4) e `fbq` (Meta Pixel), se estiverem instalados:

- `whatsapp_click`, `phone_click`, `cta_click` (com o nome do botão em `cta`)
- `generate_lead` (envio do formulário; no Pixel vira `Lead`)
- `map_open`

Para instalar GA4, GTM ou Pixel, cole o script no `<head>` e libere os domínios deles no `Content-Security-Policy` em `server.js` (`script-src`, `connect-src` e `img-src`). As UTMs da campanha (`utm_source`, `gclid`, `fbclid`…) são salvas junto com cada lead.

## Estrutura

```
public/            site (HTML, CSS, JS, imagens)
  index.html
  privacidade.html
  404.html
  assets/css/styles.css
  assets/js/main.js
  assets/img/      logo, favicon, fotos, imagem de compartilhamento
server.js          servidor HTTP + API de leads
lib/leads.js       validação, CSV e limitador de envios
test/              testes (node --test)
brand/             arquivos da logo
```
