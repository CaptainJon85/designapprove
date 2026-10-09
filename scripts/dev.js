const { spawn } = require('child_process');

function run(args){
  const child = spawn('npm', args, { stdio: 'inherit' });
  child.on('exit', code => {
    if (code) process.exit(code);
  });
  return child;
}

const api = run(['run', 'dev', '-w', '@proofline/api']);
const web = run(['run', 'dev', '-w', '@proofline/web']);

function stop(){
  api.kill();
  web.kill();
  process.exit(0);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
