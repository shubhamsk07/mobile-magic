## Things to do
 - Complete the orchestrator. Its an empty folder right now. It should talk to ASGs and scale them up/drain them when a worker becomes idle
 - Send the user response back to the LLM. If a user is changing a file, the LLM needs to be aware of this. 
 - UI cleanups
 - Figure out why npm install doesnt work from time to time. Most probably we need to run them sequentially so create some sort of async queue to do it.
 