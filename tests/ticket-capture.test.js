import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyTicketRead } from '../src/ticket-reader/core.js';
import { isConfirmedRead } from '../src/ticket-reader/metadata.js';
import { replacementIds, duplicateInHistory, duplicateError } from '../src/ticket-reader/duplicates.js';

const matched={version:2,status:'matched',plant:'colorado-materials',ticketNumber:'3556031',confidence:.99,quarterTurns:0};
let dom,w,scannerOptions;
const image='data:image/jpeg;base64,TkVX';
beforeEach(()=>{
  dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://driver.test/',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(window){
    window.fetch=vi.fn(async()=>new Response('{}'));window.scrollTo=vi.fn();window.console.error=vi.fn();
    window.DriverTicketScanner={open:async options=>{scannerOptions=options;}};
  }});
  w=dom.window;
  w.DriverTicketReader={applyTicketRead,isConfirmedRead,replacementIds,duplicateInHistory,duplicateError};
  w.driverPayReserveTicketNumber=vi.fn(async()=>({duplicate:false}));w.driverPayReleaseTicketNumber=vi.fn();
  w.driverPayApplyCloudSnapshot([{id:'s',payoutDate:'2026-09-12',loads:[
    {id:'one',day:'Thursday',miles:62,tons:25,documents:[{id:'old',processed:'data:image/jpeg;base64,T0xE',ticketRead:matched}]},
    {id:'two',day:'Friday',miles:28,tons:25,documents:[{id:'unread',processed:'data:image/jpeg;base64,VU5SRUFE',ticketRead:{version:2,status:'unreadable'}}]},
  ]}],{avgTons:25,truckNumber:'1205',userId:'driver'});
});
afterEach(()=>dom.window.close());
const history=()=>JSON.parse(w.localStorage.getItem('driver_history'));
async function capture(load='two',mode='direct',read=matched){
  await w.pickTicketPhoto({sId:'s',lId:load,mode});
  return scannerOptions.onSave(image,'black-white',{orientationVersion:1,ticketRead:read,documentId:'new'});
}
it('rejects duplicate numbers with a reason and preserves the old unreadable photo',async()=>{
  const before=history();
  await expect(capture()).rejects.toMatchObject({code:'DUPLICATE_TICKET',message:expect.stringContaining('3556031')});
  expect(history()).toEqual(before);expect(w.driverPayReserveTicketNumber).not.toHaveBeenCalled();
});
it('allows recapturing the same saved ticket but rejects adding its duplicate',async()=>{
  await expect(capture('one','add')).rejects.toMatchObject({code:'DUPLICATE_TICKET'});
  await capture('one');expect(history()[0].loads[0].documents[0]).toMatchObject({id:'new',ticketRead:matched,processed:image});
});
it('does not persist failed OCR or a duplicate reserved on another device',async()=>{
  const before=history();
  await expect(capture('two','direct',{version:2,status:'ignored'})).rejects.toThrow('Retake');
  w.driverPayReserveTicketNumber.mockResolvedValue({duplicate:true,reason:'Duplicate ticket #23696214 is already being saved.'});
  await expect(capture('two','direct',{...matched,ticketNumber:'23696214'})).rejects.toMatchObject({code:'DUPLICATE_TICKET'});
  expect(history()).toEqual(before);
});
it('saves a verified edit capture immediately without committing unrelated pay edits',async()=>{
  w.openEditModal('s','two');w.document.getElementById('editTons').value='29';
  await capture('two','edit',{...matched,ticketNumber:'3556032'});
  expect(history()[0].loads[1]).toMatchObject({tons:25,documents:[{id:'new',processed:image,ticketRead:{ticketNumber:'3556032'}}]});
  w.closeEditModal();expect(history()[0].loads[1].documents[0].id).toBe('new');
});
