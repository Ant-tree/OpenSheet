import { chromium } from 'playwright-core'
const EXE='/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const b=await chromium.launch({executablePath:EXE,args:['--no-sandbox']})
const page=await (await b.newContext({viewport:{width:1100,height:700}})).newPage()
const errs=[]; page.on('pageerror',e=>errs.push(''+e))
await page.goto('http://localhost:4173/',{waitUntil:'load'})
await page.waitForSelector('td[data-r="0"][data-c="0"]')
const cell=(r,c)=>`td[data-r="${r}"][data-c="${c}"]`
const val=async(r,c)=>((await page.textContent(cell(r,c)+' .cell-text').catch(()=>null))??await page.textContent(cell(r,c)))
const bg=async(r,c)=>page.$eval(cell(r,c),el=>getComputedStyle(el).backgroundColor)
// 1) A1=10, B1==A1*2
await page.click(cell(0,0)); await page.keyboard.type('10'); await page.keyboard.press('Enter')
await page.click(cell(0,1)); await page.keyboard.type('=A1*2'); await page.keyboard.press('Enter')
const b1_before=(await val(0,1)||'').trim()
// 2) change A1 -> 100, B1 must recompute (cache busts on rev)
await page.click(cell(0,0)); await page.keyboard.type('100'); await page.keyboard.press('Enter')
const a1=(await val(0,0)||'').trim(); const b1_after=(await val(0,1)||'').trim()
// 3) drag-select a big range then edit a far cell -> value correct (cache during drag then bust)
await page.click(cell(0,0)); await page.keyboard.down('Shift'); await page.click(cell(10,5)); await page.keyboard.up('Shift')
await page.click(cell(20,0)); await page.keyboard.type('xy'); await page.keyboard.press('Enter')
const c20=(await val(20,0)||'').trim()
// 4) border via toolbar (all) on A3, check border style present
await page.click(cell(2,0))
await page.click('.tbtn:has-text("Borders")').catch(()=>{})
await page.click('.menu-item:has-text("All")').catch(()=>{})
await page.waitForTimeout(80)
const borderA3=await page.$eval(cell(2,0),el=>getComputedStyle(el).borderTopWidth)
console.log(JSON.stringify({b1_before,a1,b1_after,c20,borderA3,errors:errs}))
await b.close()
