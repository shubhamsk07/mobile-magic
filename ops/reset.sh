kubectl delete configmap caddy-config  
kubectl delete deployment caddy-gateway   
kubectl create configmap caddy-config --from-file=Caddyfile=./Caddyfile
kubectl apply -f deployment.yml    