# Simple DNS Server

# Process
  + user req to a domain
  + client side code get the informations (ip, reqested domain)
  + if server not on maintenance it will do further process
  + client information encode then sends to server
  + server decode
  + after decode server check block ip
  + server searches to the database for ip of requested domain
  + if ip not find it sends the not found response
  + if found ip it encodes data and send response to client
  + client decode that data
  + finally send to user with response
  + after certain time it will redirect to that ip/destination
  + if user blocked then user cannot request query
  + after certain time automatically user unblocked
  + then user can request again


# Fetures
  - conversion of domain into ip
  - maintenance response when server on maintenance
  - block user on excessive requests
  - can handle both ipv4 and ipv6
  - no ip response if ip not registered
  - redirect to requested destination
  - ip unblock after certain time

# Packages
  - node
  - dns packet (npm i dns-packet)
  - express (npm i express)

# Setup
  - setup db of ip, domain
  - setup dns server
  - setup client req handler

# Run steps
  - git clone
  - run (npm i)
  - to start (npm start)
  
  query url: http://localhost:3000/dns-query?domain=google.com
