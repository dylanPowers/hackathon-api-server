package main

import "fmt"
import (
	"net/http"
	"io/ioutil"
	"io"
	"encoding/json"
	"os"
	"strings"
)

const facebookApiEndpoint = "https://graph.facebook.com/v2.5"
const album2ID = "615849938471305"
const album3ID = "855587011164262"

func main() {
	file, err := os.Open("fb-client-secret")
	if err != nil {
		fmt.Println("Can't do shit")
		return
	}

	defer file.Close()
	secret, err := ioutil.ReadAll(file)
	accessToken := requestFBAccessToken(strings.TrimSpace(string(secret)))
	dumpJson(requestPhotosForAlbum(accessToken, album2ID))


//	http.HandleFunc("/", doShit)
	if http.ListenAndServe(":8000", nil) != nil {
		fmt.Println("We aren't doing shit")
	}
}

func dumpJson(i interface{}) {
	out, _ := json.MarshalIndent(i, "", "  ")
	fmt.Println(string(out))
}

func doShit(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Doing shit")
	io.WriteString(w, "Did some shit\n")
}

func requestFBAccessToken(secret string) string {
	resp, err := http.Get(facebookApiEndpoint + "/oauth/access_token?" +
					  "client_id=162401547444127" +
					  "&client_secret=" + secret +
					  "&grant_type=client_credentials")
	if err != nil {
		fmt.Println("fail")
		return ""
	}

	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("Can't read no body")
		return ""
	}

	var f interface{}
	err = json.Unmarshal(body, &f)
	if err != nil {
		fmt.Println("Wat?!?")
		return ""
	}
	m := f.(map[string]interface{})
	return m["access_token"].(string)
}

func requestPhotosForAlbum(accessToken string, albumID string) []*Photo {
	resp, err := http.Get(facebookApiEndpoint + "/" + album2ID + "/photos?" +
						  "access_token=" + accessToken +
						  "&fields=images")
	if err != nil {
		fmt.Println("Whoops! WTF happened?", err)

	}

	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	var f Fuck
	err = json.Unmarshal(body, &f)
	if err != nil {
		fmt.Println("ERROR BITCHES: ", err)
	}

	return f.Data
}

type Photo struct {
	Images []Image `json:"images"`
}

type Image struct {
	Height int
	Source string
	Width int
}

type Fuck struct {
	Data []*Photo
	Paging interface{}
}
