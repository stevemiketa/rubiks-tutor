package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// maxBodyBytes is the largest request body the API reads. A Snapshot of
// MaxMoves Moves needs at most about 30 KB.
const maxBodyBytes = 64 << 10

// apiError is the body of every API error: a machine-readable code and a
// message a person can read, plus where invalid notation went wrong.
type apiError struct {
	status  int
	Code    string `json:"code"`
	Message string `json:"message"`
	// Field and Offset locate invalid notation: the request field, and the
	// 0-based character offset of the first invalid Move in it.
	Field  string `json:"field,omitempty"`
	Offset *int   `json:"offset,omitempty"`
}

func (e *apiError) Error() string { return e.Message }

func writeError(w http.ResponseWriter, e *apiError) {
	writeJSON(w, e.status, e)
}

// readJSON decodes a request body holding exactly one JSON value into v.
// Bodies over maxBodyBytes fail with 413 and anything else unreadable with
// 400.
func readJSON(w http.ResponseWriter, r *http.Request, v any) *apiError {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	err := dec.Decode(v)
	if err == nil {
		switch extra := dec.Decode(&json.RawMessage{}); extra {
		case io.EOF:
		case nil:
			err = errors.New("the body holds more than one JSON value")
		default:
			err = extra
		}
	}
	if _, ok := errors.AsType[*http.MaxBytesError](err); ok {
		return &apiError{
			status:  http.StatusRequestEntityTooLarge,
			Code:    "body-too-large",
			Message: fmt.Sprintf("The request body is over the %d KiB limit.", maxBodyBytes>>10),
		}
	}
	if err != nil {
		return invalidRequest(fmt.Sprintf("The request body isn't valid JSON of the right shape: %v.", err))
	}
	return nil
}

func invalidRequest(message string) *apiError {
	return &apiError{status: http.StatusBadRequest, Code: "invalid-request", Message: message}
}
