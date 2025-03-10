kubectl create secret tls wildcard-100xdevs-com-tls \                  
  --cert=fullchain.pem \
  --key=privkey.pem \
  --namespace=default

kubectl create secret tls wildcard-root-antidevs-com-tls --cert=fullchain.pem  --key=privkey.pem   --namespace=default 

kubectl create configmap caddy-config --from-file=Caddyfile=./Caddyfile

kubectl apply -f deployment.yml

