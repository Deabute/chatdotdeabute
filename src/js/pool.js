// pool.js Copyright 2020 Paul Beaudet MIT License

const pool = {
  indicator: document.getElementById('poolInd'),
  display: document.getElementById('pool'),
  onOwner: () => {},
  count: 0,
  // assume peer is counted in pool
  onIncrement: req => {
    if (req.owner) {
      pool.onOwner();
    }
    pool.count = pool.count + req.count;
    pool.display.innerHTML = pool.count;
  },
  onSet: req => {
    pool.count = req.pool;
    pool.display.innerHTML = pool.count;
  },
};

export default pool;
