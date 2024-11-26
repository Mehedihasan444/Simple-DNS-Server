const express = require("express");
const dgram = require("node:dgram");
const dnspacket = require("dns-packet");
const dnsServer = dgram.createSocket("udp4");
const httpServer = express();
const DNS_SERVER_PORT = 8000;
const HTTP_PORT = 3000;
const DNS_SERVER_HOST = "localhost";

const maintenance = false;
const REDIRECT_DELAY = 5 * 1000;
const UNBLOCK_DELAY = 10 * 1000; // 10 seconds in milliseconds
const blockedIps = [];
const userRequestLog = {};
const MAX_REQUESTS_PER_MINUTE = 5;
const TIME_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Database of IP addresses for domains
const db_of_IP = {
  "youtube.com": "142.250.196.46",
  "google.com": "142.250.195.238",
  "diu.com": "255.12.4.6",
};

// Function to unblock an IP after a delay
function unblockIp(ip) {
  setTimeout(() => {
    const index = blockedIps.indexOf(ip);
    if (index !== -1) {
      blockedIps.splice(index, 1); // Remove IP from the blocked list
      delete userRequestLog[ip]; // Clear request log for the IP
      // console.log(`Unblocked IP: ${ip}`);
    }
  }, UNBLOCK_DELAY);
}

// Function to apply rate limiting and blocking logic
function checkRateLimit(ip) {
  const currentTime = Date.now();

  if (blockedIps.includes(ip)) {
    return {
      blocked: true,
      message: "Your IP is blocked due to excessive requests.",
    };
  }
  if (!userRequestLog[ip]) userRequestLog[ip] = [];
  userRequestLog[ip] = userRequestLog[ip].filter(
    (requestTime) => currentTime - requestTime <= TIME_WINDOW
  );
  userRequestLog[ip].push(currentTime);
  if (userRequestLog[ip].length > MAX_REQUESTS_PER_MINUTE) {
    blockedIps.push(ip);
    unblockIp(ip); // Schedule unblocking after a delay
    return {
      blocked: true,
      message: "Your IP is now blocked due to excessive requests.",
    };
  }
  return { blocked: false };
}



// DNS server logic
dnsServer.on("message", (msg, rinfo) => {
  // Decode the incoming DNS packet
  const request = dnspacket.decode(msg);

  // Dynamically extract the question details
  const question = request.questions[0]; // First question (DNS allows multiple questions, but typically one is used)
  const domain = question.name; // The domain being queried
  const recordType = question.type; // The type of DNS record (e.g., A, AAAA, etc.)
  const ipAddress = db_of_IP[domain]; // Lookup the domain in the database

  // Handle cases where the domain is not found in the database
  // Handle cases where the domain is not found in the database
  if (!ipAddress) {
    const errorResponse = dnspacket.encode({
      type: "response",
      id: request.id,
      flags: dnspacket.RECURSION_AVAILABLE,
      questions: request.questions,
      answers: [],
      additionals: [],
    });
    dnsServer.send(errorResponse, rinfo.port, rinfo.address);
    return; // No further processing
  }

  // Create a response dynamically based on the query
  const response = dnspacket.encode({
    type: "response",
    id: request.id,
    flags: dnspacket.AUTHORITATIVE_ANSWER,
    questions: request.questions, // Send back the same question(s)
    answers: [
      {
        type: recordType, // Use the same type as the query
        class: question.class, // Use the same class as the query
        name: domain, // The domain name being queried
        data: ipAddress, // The resolved IP address
      },
    ],
  });
  // Send the response back to the client
  dnsServer.send(response, rinfo.port, rinfo.address);
});

dnsServer.bind(DNS_SERVER_PORT, () =>
  console.log(`DNS server running on port ${DNS_SERVER_PORT}`)
);

// HTTP API to handle DNS queries via HTTP
httpServer.get("/dns-query", (req, res) => {
  //server maintenance
  if (maintenance) {
    return res
      .status(400)
      .json({ error: "Server is on maintenance" });
  }
  const domain = req.query.domain;
  if (!domain)
    return res
      .status(400)
      .json({ error: "Domain query parameter is required." });

  const clientIp = req.ip.startsWith("::ffff:") ? req.ip.slice(7) : req.ip;
  const rateLimitResult = checkRateLimit(clientIp);
  if (rateLimitResult.blocked) {
    return res.status(403).json({ error: rateLimitResult.message });
  }
  const ipAddress = db_of_IP[domain];

  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

  let ipv = "AAAA";
  if (ipv4Regex.test(ipAddress)) {
    ipv = "A";
  }
  const message = dnspacket.encode({
    type: "query",
    id: Math.floor(Math.random() * 65535),
    flags: dnspacket.RECURSION_DESIRED,
    questions: [{ type: ipv, name: domain, class: "IN" }],
  });

  const client = dgram.createSocket("udp4");
  // this line connect to the dns server
  client.send(message, DNS_SERVER_PORT, DNS_SERVER_HOST, (err) => {
    if (err) {
      res.status(500).json({ error: "Failed to send DNS query" });
      client.close();
    }
  });

  client.on("message", (msg) => {
    const response = dnspacket.decode(msg);
    // console.log("res", response);
    const answer = response.answers[0];

    if (!answer) {
      return res.status(404).json({ error: `No IP found for domain: ${domain}` });
    }
    if (answer) {
      //  JSON data
      const jsonData = {
        id: response.id,
        type: response.type,
        flags: response.flags,
        opcode: response.opcode,
        rcode: response.rcode,
        questions: response.questions[0],
        answers: response.answers[0],
        domain: response.name,
        ip: answer.data,
      };

      // Respond with an HTML page showing JSON and redirecting after seconds
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>DNS Query Result</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              pre { background: #f4f4f4; padding: 15px; border-radius: 5px; }
            </style>
            <script>
              setTimeout(() => {
                window.location.href = "http://${answer.data}";
              }, ${REDIRECT_DELAY});
            </script>
          </head>
          <body>
            <h1>DNS Query Result</h1>
            <p>The following data was retrieved:</p>
            <pre>${JSON.stringify(jsonData, null, 2)}</pre>
            <p>Redirecting to <strong>${answer.data}</strong> in ${REDIRECT_DELAY / 1000} seconds...</p>
          </body>
        </html>
      `);
    }
    else {
      res.json({ error: "No DNS response found." });
    }

    client.close();
  });
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP server running on port ${HTTP_PORT}`);
});

