// persistence.js Copyright 2020 Paul Beaudet MIT License

const persistence = {
  answers: [],
  init: onStorageLoad => {
    if (localStorage) {
      if (!localStorage.oid) {
        localStorage.oid = persistence.createOid();
      }
      if (!localStorage.token) {
        localStorage.token = '';
      }
      if (!localStorage.paid) {
        localStorage.paid = false;
      }
      if (!localStorage.username) {
        localStorage.username = 'Anonymous';
      }
      if (localStorage.answers) {
        persistence.answers = JSON.parse(localStorage.answers);
      } else {
        localStorage.answers = JSON.stringify(persistence.answers);
      }
      onStorageLoad(true);
    } else {
      onStorageLoad(false);
    }
  },
  saveAnswer: () => {
    localStorage.answers = JSON.stringify(persistence.answers);
  },
  createOid: () => {
    const increment = Math.floor(Math.random() * 16777216).toString(16);
    const pid = Math.floor(Math.random() * 65536).toString(16);
    const machine = Math.floor(Math.random() * 16777216).toString(16);
    const timestamp = Math.floor(new Date().valueOf() / 1000).toString(16);
    return (
      '00000000'.substr(0, 8 - timestamp.length) +
      timestamp +
      '000000'.substr(0, 6 - machine.length) +
      machine +
      '0000'.substr(0, 4 - pid.length) +
      pid +
      '000000'.substr(0, 6 - increment.length) +
      increment
    );
  },
};

export default persistence;
