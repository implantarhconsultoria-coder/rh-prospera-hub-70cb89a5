export default async function handler(req:any,res:any){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.status(200).send(`<!doctype html><html><body>
  <a href="https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/temp-manual-signature-export-20260918/topac-matriz/fc7e1ee1-8d59-406f-bb07-9c671810c2bc.pdf">Matriz</a><br>
  <a href="https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/temp-manual-signature-export-20260918/topac-praia-grande/bb40fa3b-cd7f-4e1e-8a96-fff3cafd890f.pdf">Praia Grande</a><br>
  <a href="https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/temp-manual-signature-export-20260918/topac-goiania/cd8f857c-9b62-4641-85e5-07ca9d8a7577.pdf">Goiania</a><br>
  <a href="https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/temp-manual-signature-export-20260918/alqui-obras/cf1c9a67-515b-45d1-af90-b1fa5407b615.pdf">ALQUI</a><br>
  <a href="https://djfjnxmbvjgweqzjvqtr.supabase.co/storage/v1/object/public/temp-manual-signature-export-20260918/lmt/02be870b-3fb3-4fb0-8157-c73c4f4a4663.pdf">LMT</a>
  </body></html>`);
}