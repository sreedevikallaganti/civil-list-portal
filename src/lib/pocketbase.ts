import PocketBase from 'pocketbase';

const pb = new PocketBase('http://172.30.0.200:8091');

// Enable auto-cancelation
pb.autoCancellation(false);

export default pb;