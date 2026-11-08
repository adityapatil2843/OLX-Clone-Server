import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 50,
  duration: '15s',
};

export default function () {
  // Test endpoint with exact PORT and API version
  const res = http.get('http://127.0.0.1:8000/api/v1/users');

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  if (res.status !== 200) {
    console.log(`Failed! Status: ${res.status} | Body: ${res.body.slice(0, 150)}`);
  }

  sleep(0.5);
}
