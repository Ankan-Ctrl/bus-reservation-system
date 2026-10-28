const oracledb = require("oracledb");

let poolPromise;

function getConnectionConfig() {
  const { ORACLE_USER, ORACLE_PASSWORD, ORACLE_CONNECT_STRING } = process.env;
  if (!ORACLE_USER || !ORACLE_PASSWORD || !ORACLE_CONNECT_STRING) {
    const error = new Error("Set ORACLE_USER, ORACLE_PASSWORD, and ORACLE_CONNECT_STRING in your local .env file.");
    error.status = 503;
    error.code = "ORACLE_NOT_CONFIGURED";
    throw error;
  }
  return {
    user: ORACLE_USER,
    password: ORACLE_PASSWORD,
    connectString: ORACLE_CONNECT_STRING
  };
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = oracledb.createPool({ ...getConnectionConfig(), poolMin: 0, poolMax: 5, poolIncrement: 1 })
      .catch((error) => {
        poolPromise = undefined;
        throw error;
      });
  }
  return poolPromise;
}

async function withConnection(callback) {
  const pool = await getPool();
  const connection = await pool.getConnection();
  try {
    return await callback(connection);
  } finally {
    await connection.close();
  }
}

async function closePool() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.close(10);
}

module.exports = { closePool, getConnectionConfig, withConnection };
