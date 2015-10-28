FROM ubuntu:14.04

ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      wget

ENV GO_VERSION 1.5.1
RUN wget https://storage.googleapis.com/golang/go${GO_VERSION}.linux-amd64.tar.gz \
      --output-document go && \
    tar -vxzf go -C /opt && \
    ln -s /opt/go/bin/go /usr/local/bin/
ENV GOROOT /opt/go

COPY ./fb-client-secret /hackathon-api-server/
VOLUME /hackathon-api-server/src

