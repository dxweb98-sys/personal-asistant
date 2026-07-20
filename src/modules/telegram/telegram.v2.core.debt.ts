import*as C from"./telegram.v2.core.base.js";const{Markup:n,prisma:P,debtService:g,financeService:f,investmentService:G,settingsService:Y,getTelegramTheme:J,reportService:X,reportQuerySchema:z,sessions:h,countryLabel:Q,languageLabel:W,debtStatusLabel:U,debtPriorityLabel:w,debtPolicyLabel:D,installmentStatusLabel:T,expenseCategories:q,categoryLabel:Z,html:t,numberValue:l,money:s,dateText:k,dateTimeText:A,progressBar:B,isActiveDebt:F,accountIcon:M,userFor:y,preferenceFor:x,backHome:aa}=C;async function L(r){const e=await y(r),a=(await g.list(e.id)).filter(F),u=a.filter(m=>m.status==="OVERDUE"),i=a.filter(m=>["CRITICAL","URGENT"].includes(m.priority)),b=new Map;for(const m of a){const p=String(m.currency??"IDR").toUpperCase();b.set(p,(b.get(p)??0)+l(m.remainingPrincipal))}const o=b.size?[...b.entries()].map(([m,p])=>s(p,m)).join(" • "):"Belum ada utang aktif",c=await P.debtInstallment.findFirst({where:{debt:{userId:e.id},status:{in:["UPCOMING","DUE","PARTIAL","OVERDUE","RESCHEDULED"]}},include:{debt:!0},orderBy:{dueDate:"asc"}});await r.reply(`💳 <b>Utang &amp; Tagihan</b>

Kelola semua kewajiban dari satu tempat: tambah utang, lihat detail, cek jadwal, dan catat pembayaran.

📌 Utang aktif: <b>${a.length}</b>
💰 Total tersisa: <b>${t(o)}</b>
🚨 Terlambat: <b>${u.length}</b>
⚡ Prioritas tinggi: <b>${i.length}</b>
📅 Tagihan terdekat: <b>${t(c?`${c.debt.name} • ${k(c.dueDate)}`:"Belum ada jadwal")}</b>`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("➕ Tambah Utang","debt:add:start"),n.button.callback("📋 Daftar Utang","debt:list")],[n.button.callback("💸 Bayar Utang","debt:pay:list"),n.button.callback("📅 Tagihan Terdekat","debt:upcoming")],[n.button.callback("📊 Ringkasan Utang","debt:summary")],[n.button.callback("🗂️ Data & Master","menu:master"),n.button.callback("🏠 Beranda","menu:home")]])})}async function I(r,e="VIEW"){const d=await y(r),a=(await g.list(d.id)).filter(F);if(!a.length){await r.reply(`💳 <b>Belum ada utang</b>

Tambahkan utang pertama agar sisa kewajiban, jadwal cicilan, dan pembayaran bisa dilacak dari Telegram.`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("➕ Tambah Utang","debt:add:start")],[n.button.callback("⬅️ Menu Utang","menu:debt")]])});return}const u=a.map(i=>[n.button.callback(`${i.status==="OVERDUE"?"🚨":i.priority==="CRITICAL"?"🔴":i.priority==="URGENT"?"🟠":"💳"} ${i.name} • ${s(l(i.remainingPrincipal),i.currency??"IDR")}`,e==="PAY"?`debt:pay:start:${i.id}`:`debt:view:${i.id}`)]);u.push([n.button.callback("➕ Tambah Utang","debt:add:start"),n.button.callback("⬅️ Menu Utang","menu:debt")]),await r.reply(e==="PAY"?`💸 <b>Pilih Utang yang Dibayar</b>

Pilih berdasarkan daftar utangmu. Setelah itu pilih nominal dan akun sumber pembayaran.`:`📋 <b>Daftar Utang Aktif</b>

Pilih salah satu untuk melihat detail, progres, jadwal, dan riwayat pembayaran.`,{parse_mode:"HTML",...n.inlineKeyboard(u)})}async function R(r,e){const d=await y(r),a=await g.find(d.id,e),u=l(a.originalPrincipal),i=l(a.remainingPrincipal),b=Math.max(0,u-i),c=(a.installments??[]).filter($=>["UPCOMING","DUE","PARTIAL","OVERDUE","RESCHEDULED"].includes($.status))[0],m=(a.charges??[]).filter($=>["BILLED","PARTIAL"].includes($.billingStatus)).reduce(($,E)=>$+l(E.amount)-l(E.paidAmount),0),p=a.payments?.[0];await r.reply(`💳 <b>${t(a.name)}</b>

🏢 Pemberi utang: <b>${t(a.creditor)}</b>
🏷 Status: <b>${t(U[a.status]??a.status)}</b>
⚡ Prioritas: <b>${t(w[a.priority]??a.priority)}</b>
🧩 Skema: <b>${t(D[a.paymentPolicy]??a.paymentPolicy)}</b>

💰 Nilai awal: <b>${t(s(u,a.currency))}</b>
✅ Sudah dibayar: <b>${t(s(b,a.currency))}</b>
📉 Sisa pokok: <b>${t(s(i,a.currency))}</b>
🧾 Denda/biaya tertagih: <b>${t(s(m,a.currency))}</b>

<code>${t(B(b,u))}</code>

📅 Tagihan berikutnya: <b>${t(c?`${k(c.dueDate)} • ${s(l(c.scheduledPrincipal)-l(c.paidPrincipal),a.currency)}`:"Belum ada")}</b>
🕒 Pembayaran terakhir: <b>${t(p?`${k(p.paidAt)} • ${s(l(p.amount),a.currency)}`:"Belum pernah")}</b>`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("💸 Catat Pembayaran",`debt:pay:start:${a.id}`)],[n.button.callback("📅 Jadwal Cicilan",`debt:schedule:${a.id}`),n.button.callback("🧾 Riwayat Bayar",`debt:history:${a.id}`)],[n.button.callback("📋 Daftar Utang","debt:list"),n.button.callback("🏠 Beranda","menu:home")]])})}async function S(r,e){const d=await y(r),a=await g.find(d.id,e),u=(a.installments??[]).slice(0,12).map((i,b)=>{const o=Math.max(0,l(i.scheduledPrincipal)-l(i.paidPrincipal));return`${b+1}. <b>${t(i.period)}</b> • ${t(k(i.dueDate))}
   ${t(s(o,a.currency))} • ${t(T[i.status]??i.status)}`});await r.reply(`📅 <b>Jadwal ${t(a.name)}</b>

${u.length?u.join(`

`):"Belum ada jadwal cicilan. Utang fleksibel tetap bisa dibayar dari tombol Bayar Utang."}`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("💸 Bayar Utang",`debt:pay:start:${a.id}`)],[n.button.callback("⬅️ Kembali ke Detail",`debt:view:${a.id}`)]])})}async function _(r,e){const d=await y(r),a=await g.find(d.id,e),u=(a.payments??[]).slice(0,10).map((i,b)=>`${b+1}. <b>${t(s(l(i.amount),a.currency))}</b>
   ${t(A(new Date(i.paidAt)))}${i.note?` • ${t(i.note)}`:""}`);await r.reply(`🧾 <b>Riwayat Pembayaran ${t(a.name)}</b>

${u.length?u.join(`

`):"Belum ada pembayaran tercatat."}`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("💸 Catat Pembayaran",`debt:pay:start:${a.id}`)],[n.button.callback("⬅️ Kembali ke Detail",`debt:view:${a.id}`)]])})}async function N(r){const e=await y(r),a=(await P.debtInstallment.findMany({where:{debt:{userId:e.id},status:{in:["UPCOMING","DUE","PARTIAL","OVERDUE","RESCHEDULED"]}},include:{debt:!0},orderBy:{dueDate:"asc"},take:10})).map((u,i)=>{const b=Math.max(0,l(u.scheduledPrincipal)-l(u.paidPrincipal));return`${i+1}. <b>${t(u.debt.name)}</b>
   ${t(k(u.dueDate))} • ${t(s(b,u.debt.currency))} • ${t(T[u.status]??u.status)}`});await r.reply(`📅 <b>Tagihan Terdekat</b>

${a.length?a.join(`

`):"Belum ada jadwal tagihan aktif."}`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("💸 Bayar Utang","debt:pay:list")],[n.button.callback("⬅️ Menu Utang","menu:debt")]])})}async function H(r){const e=await y(r),a=(await g.list(e.id)).filter(F),u=new Map;for(const b of a){const o=String(b.currency??"IDR").toUpperCase(),c=u.get(o)??{original:0,remaining:0,count:0};c.original+=l(b.originalPrincipal),c.remaining+=l(b.remainingPrincipal),c.count+=1,u.set(o,c)}const i=[...u.entries()].map(([b,o])=>{const c=Math.max(0,o.original-o.remaining);return`<b>${t(b)}</b> • ${o.count} utang
Awal ${t(s(o.original,b))}
Tersisa ${t(s(o.remaining,b))}
<code>${t(B(c,o.original))}</code>`});await r.reply(`📊 <b>Ringkasan Utang</b>

${i.length?i.join(`

`):"Belum ada utang aktif."}`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("📋 Daftar Utang","debt:list"),n.button.callback("💸 Bayar Utang","debt:pay:list")],[n.button.callback("⬅️ Menu Utang","menu:debt")]])})}async function K(r){h.set(r.chat.id,{kind:"DEBT_CREATE_POLICY"}),await r.reply(`➕ <b>Tambah Utang</b>

Pilih pola pembayaran yang paling sesuai.`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("📅 Cicilan Tetap","debt:add:policy:FIXED")],[n.button.callback("🔄 Pembayaran Fleksibel","debt:add:policy:FLEXIBLE")],[n.button.callback("🤝 Bisa Dinegosiasikan","debt:add:policy:NEGOTIABLE")],[n.button.callback("❌ Batal","session:cancel")]])})}async function j(r,e){await r.reply(`🔎 <b>Periksa Data Utang</b>

Nama: <b>${t(e.name)}</b>
Pemberi utang: <b>${t(e.creditor)}</b>
Nilai awal: <b>${t(s(e.originalPrincipal,e.currency))}</b>
Pola: <b>${t(D[e.paymentPolicy]??e.paymentPolicy)}</b>
Target per bulan: <b>${t(s(e.monthlyAmount,e.currency))}</b>
Jatuh tempo: <b>${e.dueDay?`Tanggal ${e.dueDay}`:"Fleksibel"}</b>
Tenor: <b>${e.tenorMonths?`${e.tenorMonths} bulan`:"Tidak ditentukan"}</b>
Prioritas: <b>${t(w[e.priority]??e.priority)}</b>`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("✅ Simpan Utang","debt:add:confirm")],[n.button.callback("✏️ Ulangi","debt:add:start"),n.button.callback("❌ Batal","session:cancel")]])})}async function O(r,e){const d=await y(r),a=await g.find(d.id,e),u=(a.installments??[]).find(m=>["UPCOMING","DUE","PARTIAL","OVERDUE","RESCHEDULED"].includes(m.status)),i=u?Math.max(0,l(u.scheduledPrincipal)-l(u.paidPrincipal)):0,b=l(a.fixedMonthlyAmount)||l(a.targetMonthlyAmount)||l(a.minimumMonthlyAmount),o=l(a.remainingPrincipal);h.set(r.chat.id,{kind:"DEBT_PAYMENT_AMOUNT",debtId:a.id,debtName:a.name,debtCurrency:a.currency??"IDR",remainingPrincipal:o});const c=[];i>0&&c.push([n.button.callback(`📅 Tagihan ${s(i,a.currency)}`,`debtpay:amount:${i}`)]),b>0&&Math.abs(b-i)>.001&&c.push([n.button.callback(`🎯 Target ${s(Math.min(b,o),a.currency)}`,`debtpay:amount:${Math.min(b,o)}`)]),c.push([n.button.callback("⌨️ Ketik Nominal","debtpay:amount:custom"),n.button.callback("🏁 Lunasi",`debtpay:amount:${o}`)]),c.push([n.button.callback("❌ Batal","session:cancel")]),await r.reply(`💸 <b>Bayar ${t(a.name)}</b>

Sisa utang: <b>${t(s(o,a.currency))}</b>
${u?`Tagihan berikutnya: <b>${t(k(u.dueDate))}</b>`:"Belum ada jadwal cicilan."}

Pilih nominal atau ketik sendiri.`,{parse_mode:"HTML",...n.inlineKeyboard(c)})}async function v(r,e){h.set(r.chat.id,{...e,kind:"DEBT_PAYMENT_ACCOUNT"});const d=await y(r),a=(await f.listAccounts(d.id)).filter(i=>!["CREDIT_CARD","PAYLATER"].includes(i.type)&&i.currency===e.debtCurrency);if(!a.length){await r.reply(`🏦 <b>Belum ada akun ${t(e.debtCurrency)}</b>

Buat akun sumber pembayaran terlebih dahulu. Setelah selesai, alur pembayaran akan dilanjutkan.`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("➕ Buat Akun","account:add:start")],[n.button.callback("❌ Batal","session:cancel")]])});return}const u=a.map(i=>[n.button.callback(`${M(i.type)} ${i.name} • ${s(l(i.currentBalance),i.currency)}`,`debtpay:account:${i.id}`)]);u.push([n.button.callback("❌ Batal","session:cancel")]),await r.reply(`🏦 <b>Pilih Sumber Pembayaran</b>

Nominal: <b>${t(s(e.amount,e.debtCurrency))}</b>
Pilih akun dengan mata uang yang sama.`,{parse_mode:"HTML",...n.inlineKeyboard(u)})}async function V(r,e){h.set(r.chat.id,{...e,kind:"DEBT_PAYMENT_CONFIRM"}),await r.reply(`🔎 <b>Periksa Pembayaran</b>

Utang: <b>${t(e.debtName)}</b>
Nominal: <b>${t(s(e.amount,e.debtCurrency))}</b>
Sumber: <b>${t(e.accountName)}</b>
Catatan: <b>${t(e.note||"Pembayaran utang")}</b>

Setelah disimpan, saldo akun berkurang dan sisa utang diperbarui.`,{parse_mode:"HTML",...n.inlineKeyboard([[n.button.callback("✅ Simpan Pembayaran","debtpay:confirm")],[n.button.callback("❌ Batal","session:cancel")]])})}export{K as beginDebtCreation,O as beginDebtPayment,v as selectDebtPaymentAccount,R as sendDebtDetail,_ as sendDebtHistory,L as sendDebtHub,I as sendDebtList,S as sendDebtSchedule,H as sendDebtSummary,N as sendUpcomingDebts,V as showDebtPaymentPreview,j as showDebtPreview};