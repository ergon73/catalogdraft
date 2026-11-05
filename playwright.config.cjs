const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:30000,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:8781',browserName:'chromium',channel:process.env.PW_CHANNEL||undefined,headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node scripts/serve.cjs',url:'http://127.0.0.1:8781',reuseExistingServer:!process.env.CI,timeout:10000}
});
