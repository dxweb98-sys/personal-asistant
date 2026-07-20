import*as P from"./telegram.v2.core.base.js";const{Markup:a,prisma:A,debtService:N,financeService:T,investmentService:f,settingsService:J,getTelegramTheme:S,reportService:B,reportQuerySchema:D,sessions:m,countryLabel:H,languageLabel:v,categoryLabel:$,expenseCategories:C,html:n,numberValue:p,money:i,dateText:z,dateTimeText:E,progressBar:Q,isActiveDebt:L,getProfile:I,userFor:d,preferenceFor:w,backHome:_}=P;async function K(t){await t.reply(`📈 <b>Investasi</b>

Lihat portfolio, kelola master instrumen dan platform, atau perbarui harga hanya saat dibutuhkan.`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("📊 Lihat Portfolio","investment:portfolio")],[a.button.callback("➕ Tambah Instrumen","instrument:add:start"),a.button.callback("🏦 Tambah Platform","platform:add:start")],[a.button.callback("🔄 Update Harga","price:list"),a.button.callback("📋 Daftar Platform","platform:list")],[a.button.callback("🏠 Beranda","menu:home")]])})}async function O(t){const e=await d(t),r=await f.portfolio(e.id),u=(r.items??[]).slice(0,10).map(s=>{const b=s.type==="STOCK"?"📈":s.type==="CRYPTO"?"🪙":s.type==="GOLD"?"🥇":"💼",c=s.currentPrice==null?"⚪ hanya modal beli":s.valuationStatus==="STALE_PRICE"?"🟡 harga lama":"🟢 harga terbaru";return`${b} <b>${n(s.symbol)}</b> • ${n(c)}
${s.marketValue==null?`Modal ${n(i(s.costBasis,s.currency??r.displayCurrency))}`:`Nilai ${n(i(s.marketValue,s.currency??r.displayCurrency))}`}`});await t.reply(`📊 <b>Portfolio</b>

✅ Nilai pasar terkonfirmasi: <b>${n(i(r.confirmedMarketValue,r.displayCurrency))}</b>
🕒 Estimasi harga lama: <b>${n(i(r.estimatedMarketValue,r.displayCurrency))}</b>
🧾 Modal belum tervaluasi: <b>${n(i(r.unpricedInvestmentCost,r.displayCurrency))}</b>

${u.length?u.join(`

`):"Belum ada instrumen investasi."}`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("🔄 Update Harga","price:list"),a.button.callback("➕ Tambah Instrumen","instrument:add:start")],[a.button.callback("⬅️ Menu Investasi","menu:investment")]])})}async function R(t){const e=await d(t),r=await w(e.id),[o,u,s,b]=await Promise.all([T.cashflow(e.id,new Date(new Date().getFullYear(),new Date().getMonth(),1),new Date),N.list(e.id),T.listAccounts(e.id),f.portfolio(e.id)]),c=s.filter(l=>["CASH","BANK","E_WALLET"].includes(l.type)).filter(l=>l.currency===r.baseCurrency).reduce((l,k)=>l+p(k.currentBalance),0),h=u.filter(L).filter(l=>(l.currency??"IDR")===r.baseCurrency).reduce((l,k)=>l+p(k.remainingPrincipal),0),g=p(b.confirmedMarketValue),M=c+g-h;await t.reply(`📊 <b>Ringkasan Keuangan</b>

💵 Aset likuid (${n(r.baseCurrency)}): <b>${n(i(c,r.baseCurrency))}</b>
📈 Investasi terkonfirmasi: <b>${n(i(g,r.baseCurrency))}</b>
💳 Kewajiban terkonfirmasi: <b>${n(i(h,r.baseCurrency))}</b>
🧮 Net worth terkonfirmasi: <b>${n(i(M,r.baseCurrency))}</b>

📥 Pemasukan bulan ini: ${n(i(o.income,r.baseCurrency))}
📤 Pengeluaran bulan ini: ${n(i(o.expense,r.baseCurrency))}
💸 Pembayaran utang: ${n(i(o.debtPayment,r.baseCurrency))}
🧭 Arus kas bersih: <b>${n(i(o.netCashFlow,r.baseCurrency))}</b>`,{parse_mode:"HTML",..._()})}function y(t){return`${t.getUTCFullYear()}-${String(t.getUTCMonth()+1).padStart(2,"0")}`}function F(t,e){const[r,o]=t.split("-").map(Number);return y(new Date(Date.UTC(r,o-1+e,1)))}async function U(t){await t.reply(`📑 <b>Laporan Keuangan</b>

Pilih periode. Semua angka memakai pengaturan mata uang dan zona waktu aktif dari database.`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("Hari ini","report:preset:TODAY"),a.button.callback("Minggu ini","report:preset:THIS_WEEK")],[a.button.callback("Bulan ini","report:preset:THIS_MONTH"),a.button.callback("Bulan lalu","report:preset:PREVIOUS_MONTH")],[a.button.callback("Tahun ini","report:preset:THIS_YEAR"),a.button.callback("Seluruh periode","report:preset:ALL")],[a.button.callback("🏠 Beranda","menu:home")]])})}async function x(t,e){const r=await d(t),o=D.parse({preset:e.month?"MONTH":e.preset,...e.month?{month:e.month}:{},grouping:e.preset==="THIS_YEAR"?"MONTH":e.preset==="ALL"?"YEAR":"NONE",page:1,limit:10}),u=await B.build(r.id,o),s=e.month??(u.period.from?y(new Date(u.period.from)):y(new Date)),b=e.preset==="THIS_MONTH"||e.preset==="PREVIOUS_MONTH"||e.month?[a.button.callback("← Bulan sebelumnya",`report:month:${F(s,-1)}`),a.button.callback("Bulan berikutnya →",`report:month:${F(s,1)}`)]:null,c=[];b&&c.push(b),c.push([a.button.callback("📄 PDF",`report:export:${e.month?"MONTH":e.preset}:pdf:${e.month??"-"}`),a.button.callback("📊 XLSX",`report:export:${e.month?"MONTH":e.preset}:xlsx:${e.month??"-"}`),a.button.callback("🧾 CSV",`report:export:${e.month?"MONTH":e.preset}:csv:${e.month??"-"}`)]),c.push([a.button.callback("🗓 Pilih periode","menu:reports")]),c.push([a.button.callback("🏠 Beranda","menu:home")]),await t.reply(`📑 <b>${n(u.period.label)}</b>

📥 Pendapatan: <b>${n(i(u.totals.income,u.currency))}</b>
📤 Pengeluaran: <b>${n(i(u.totals.expense,u.currency))}</b>
💸 Pembayaran utang: <b>${n(i(u.totals.debtPayment,u.currency))}</b>
🧭 Arus kas bersih: <b>${n(i(u.totals.netCashFlow,u.currency))}</b>

🧾 Tagihan belum dibayar: ${n(i(u.totals.unpaidBills,u.currency))}
💳 Total utang: ${n(i(u.totals.totalDebt,u.currency))}
📈 Investasi: ${n(i(u.totals.investmentValue,u.currency))}
🏷 Dana belum dialokasikan: ${n(i(u.totals.unallocatedFunds,u.currency))}

Transaksi ditemukan: <b>${u.pagination.total}</b>`,{parse_mode:"HTML",...a.inlineKeyboard(c)})}async function V(t,e){const r=await d(t),o=await A.financialTransaction.findFirst({where:{id:e,userId:r.id},include:{category:!0,sourceAccount:!0,destinationAccount:!0,tags:{include:{tag:!0}}}});if(!o)return t.reply("Transaksi tidak ditemukan.");await t.reply(`🧾 <b>Detail Transaksi</b>

Jenis: <b>${n(o.type)}</b>
Status: <b>${n(o.status)}</b>
Nominal: <b>${n(i(p(o.amount),o.currency))}</b>
Tanggal: ${n(E(new Date(o.occurredAt)))}
Dari: ${n(o.sourceAccount?.name??"-")}
Ke: ${n(o.destinationAccount?.name??"-")}
Kategori: ${n(o.category?.name??"-")}
Catatan: ${n(o.description??"-")}`,{parse_mode:"HTML",...a.inlineKeyboard([...o.status==="POSTED"?[[a.button.callback("↩️ Batalkan Transaksi",`transaction:cancel:ask:${o.id}`)]]:[],[a.button.callback("🔁 Buat Serupa",`transaction:similar:${o.id}`)],[a.button.callback("🏠 Beranda","menu:home")]])})}async function Y(t){const e=await d(t),r=await w(e.id),o=await I(t.chat.id);await t.reply(`⚙️ <b>Pengaturan</b>

🌍 Negara: <b>${n(H[o?.country??"ID"])}</b>
🗣 Bahasa: <b>${n(v[o?.language??"id"])}</b>
💱 Mata uang utama: <b>${n(r.baseCurrency)}</b>
🎨 Tema: <b>${n(S(r.telegramTheme).name)}</b>
✨ Motivasi: <b>${r.showMotivation?"Aktif":"Nonaktif"}</b>`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("💱 Mata Uang","settings:currency"),a.button.callback("🎨 Tema","settings:theme")],[a.button.callback("🌐 Update Kurs","fx:update"),a.button.callback("✨ Motivasi","settings:motivation")],[a.button.callback("🔄 Ulangi Konfigurasi","settings:setup")],[a.button.callback("🏠 Beranda","menu:home")]])})}async function X(t){m.set(t.chat.id,{kind:"INCOME_AMOUNT"}),await t.reply(`💰 <b>Catat Pendapatan</b>

Ketik nominal yang diterima.
Contoh: <code>7500000</code>`,{parse_mode:"HTML"})}async function W(t){m.set(t.chat.id,{kind:"EXPENSE_CATEGORY"});const e=[];for(let r=0;r<C.length;r+=2)e.push(C.slice(r,r+2).map(([o,u])=>a.button.callback(o,`expense:category:${u}`)));e.push([a.button.callback("❌ Batal","session:cancel")]),await t.reply(`💸 <b>Catat Pengeluaran</b>

Pengeluaran ini untuk apa? Pilih kategori supaya laporanmu mudah dibaca.`,{parse_mode:"HTML",...a.inlineKeyboard(e)})}async function j(t,e){m.set(t.chat.id,{kind:"EXPENSE_AMOUNT",category:e}),await t.reply(`💸 <b>${n($[e]??"Pengeluaran")}</b>

Pilih nominal cepat atau ketik sendiri.`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("10 rb","expense:amount:10000"),a.button.callback("25 rb","expense:amount:25000"),a.button.callback("50 rb","expense:amount:50000")],[a.button.callback("100 rb","expense:amount:100000"),a.button.callback("250 rb","expense:amount:250000"),a.button.callback("500 rb","expense:amount:500000")],[a.button.callback("⌨️ Ketik Nominal","expense:amount:custom")],[a.button.callback("❌ Batal","session:cancel")]])})}async function q(t,e){m.set(t.chat.id,{...e,kind:"EXPENSE_CONFIRM"}),await t.reply(`🔎 <b>Periksa Pengeluaran</b>

Kategori: <b>${n($[e.category]??e.category)}</b>
Nominal: <b>${n(i(e.amount,e.accountCurrency))}</b>
Akun: <b>${n(e.accountName)}</b>${e.debtName?`
Terkait utang: <b>${n(e.debtName)}</b>`:""}
Catatan: <b>${n(e.note||"Tanpa catatan")}</b>
Waktu: <b>${n(E())}</b>`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("✅ Simpan Pengeluaran","expense:confirm")],[a.button.callback("❌ Batal","session:cancel")]])})}async function G(t,e){m.set(t.chat.id,{...e,kind:"TRANSACTION_SIMILAR_CONFIRM"}),await t.reply(`🔁 <b>Buat Transaksi Serupa</b>

Jenis: <b>${n(e.transactionType)}</b>
Nominal: <b>${n(i(e.amount,e.currency))}</b>
Catatan: ${n(e.description||"-")}

Periksa kembali sebelum menyimpan.`,{parse_mode:"HTML",...a.inlineKeyboard([[a.button.callback("✏️ Ubah Nominal","transaction:similar:amount"),a.button.callback("📝 Ubah Catatan","transaction:similar:note")],[a.button.callback("✅ Simpan Transaksi","transaction:similar:confirm")],[a.button.callback("❌ Batal","session:cancel")]])})}export{y as monthKey,R as sendDashboard,K as sendInvestmentMenu,O as sendPortfolio,U as sendReportMenu,x as sendReportSummary,Y as sendSettings,V as sendTransactionDetail,F as shiftMonth,j as showExpenseAmount,q as showExpensePreview,G as showSimilarTransactionPreview,W as startExpense,X as startIncome};