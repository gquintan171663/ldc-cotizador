import sql from "mssql";
import { writeFileSync } from "node:fs";
import "dotenv/config";
const cfg = {
  server: process.env.PDW_SERVER, database: process.env.PDW_DATABASE,
  user: process.env.PDW_USER, password: process.env.PDW_PASSWORD,
  port: Number(process.env.PDW_PORT || 1433),
  options: { encrypt: true, trustServerCertificate: false, connectTimeout: 60000 },
  pool: { max: 2, min: 0, idleTimeoutMillis: 15000 },
};
function toCsv(rows){ if(!rows.length) return ""; const cols=Object.keys(rows[0]);
  const esc=(v)=>{const s=v==null?"":String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  return [cols.join(","),...rows.map(r=>cols.map(c=>esc(r[c])).join(","))].join("\n"); }
async function main(){
  const pool=await sql.connect(cfg);
  const since=`DATEADD(year,-3,GETDATE())`;
  const win=`f.CustomerKey=2955 AND f.DirectionKey='Export' AND (f.ApprovedCargoReadyDate>=${since} OR f.PlannedCargoReadyDate>=${since})`;
  const q=async(join,cols)=>(await pool.request().query(`SELECT DISTINCT ${cols} FROM factShipments f ${join} WHERE ${win} AND x.Name IS NOT NULL AND x.Name<>'' ORDER BY x.Name`)).recordset;
  const P=`x.Name, x.Address1, x.Address2, x.City, x.StateName AS State, x.Country, x.Phone, x.PrimaryContact AS Contact, x.PrimaryContactEmail AS Email, x.VATNumber AS VAT`;
  const shippers=await q(`JOIN dimShippers x ON x.ShipperKey=f.ShipperKey`,P);
  writeFileSync("exp_shippers.csv",toCsv(shippers));
  const consignees=await q(`JOIN dimConsignees x ON x.ConsigneeKey=f.ConsigneeKey`,P);
  writeFileSync("exp_consignees.csv",toCsv(consignees));
  const notify=await q(`JOIN dimNotifyOne x ON x.NotifyOneKey=f.NotifyOneKey`,P);
  writeFileSync("exp_notify.csv",toCsv(notify));
  const consol=await q(`JOIN dimConsolidators x ON x.ConsolidatorKey=f.ConsolidatorKey`,P);
  writeFileSync("exp_consolidators.csv",toCsv(consol));
  const patios=(await pool.request().query(`SELECT DISTINCT a.Name,a.Address1,a.Address2,a.City,a.State,a.Country FROM factShipments f JOIN dimCustomerAddresses a ON a.CustomerAddressKey=f.CustomerAddressKey WHERE ${win} AND a.Name IS NOT NULL AND a.Name<>'' ORDER BY a.Name`)).recordset;
  writeFileSync("exp_patios.csv",toCsv(patios));
  console.log(JSON.stringify({shippers:shippers.length,consignees:consignees.length,notify:notify.length,consolidators:consol.length,patios:patios.length},null,2));
  await pool.close();
}
main().catch(e=>{console.error(e);process.exit(1);});
