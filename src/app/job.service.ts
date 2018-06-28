import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs/Rx';
import { Job } from './job';
import {WebDAV, Headers} from 'angular-webdav';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {toBase64String} from '@angular/compiler/src/output/source_map';
import {isArray, isObject} from 'util';
import {safeLoad} from 'js-yaml';


export interface JobDescription {
  name: string;
  input: WorkflowInput;
  workflow: string;
}

export interface InputElement {
  id: string;
  name: string;
  description: string;
  type: string;
}

export interface WorkflowInput {
  id: string;
  description: string;
  type: string;
  default: any;
}

export interface Workflow {
  name: string;
  description: string;
  filename: string;
  inputs: WorkflowInput[];
}

@Injectable()
export class JobService {
  private _username: string;
  private _password: string;
  private _selectedJob: BehaviorSubject<Job>;
  private _updateList: BehaviorSubject<boolean>;
  private _isConnected: BehaviorSubject<boolean>;
  private api = 'http://localhost:8080/jobs';
  private webdav_host = 'http://localhost:8989';
  private webdav_dir = '/webdav/';
  private cwl_dir = 'cwl/';
  public inputElements: InputElement[];

  constructor(
    private http: HttpClient,
    private webdav: WebDAV
  ) {
    this._selectedJob = <BehaviorSubject<Job>>new BehaviorSubject(null);
    this._updateList = <BehaviorSubject<boolean>>new BehaviorSubject(false);
    this._isConnected = new BehaviorSubject<boolean>(false);
    this.inputElements = [];
  }

  get selectedJob() {
    return this._selectedJob.asObservable();
  }

  authHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': 'Basic ' + btoa(this._username + ':' + this._password)
    });
  }

  connect(username: string, password: string): Promise<void> {
    this._username = username;
    this._password = password;
    const options = {
      headers: this.authHeaders(),
      responseType: 'text' as 'text'
    };

    return Promise.all([
      this.http.get(this.api, options).toPromise(),
      this.http.get(this.webdavUrl, options).toPromise()
    ]).then(_ => {
      console.log('success!');
      this._isConnected.next(true);
    }).catch(error => {
      console.log('error!', error);
      this._isConnected.next(false);
      throw error;
    });
  }

  get isConnected(): BehaviorSubject<boolean> {
    return this._isConnected;
  }

  set setSelectedJob(job: Job) {
    this._selectedJob.next(job);
  }

  get webdavUrl(): string {
    return this.webdav_host + this.webdav_dir;
  }

  set updateList(update: boolean) {
    if (this._updateList.value !== update) {
      this._updateList.next(update);
    }
  }

  get getUpdateListObserver(): Observable<boolean> {
    return this._updateList.asObservable();
  }

  getJob(jobId: string): Observable<Job> {
    const options = {headers: this.authHeaders()};
    return this.http.get<Job>(this.api + '/' + jobId, options);
  }

  getAllJobs(): Observable<Job[]> {
    const options = {headers: this.authHeaders()};
    return this.http.get<Job[]>(this.api, options);
  }

  createDir(dirname: string): Promise<boolean> {
    const dir_url = this.webdavUrl + dirname + '/';
    const headers = this.authHeaders();

    return new Promise<boolean>((resolve, reject) => {
      this.http.get(dir_url, {headers: headers, responseType: 'text'}).subscribe(
        (value) => {
          resolve(true);
        },
        (error) => {
          if (error.status === 404) {
            this.http.request('mkcol', dir_url, {headers: headers}).subscribe(
              (value) => {
                resolve(true);
              },
              (err2) => {
                reject(err2);
              }
            );
          } else {
            reject(error);
          }
        });
    });
  }

  uploadFile(file, dirname): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = readfile => {
        const contents: any = readfile.target;
        const body = contents.result;

        const header =  this.authHeaders();
        header.append('Content-Type', 'application/octet-stream');

        const path = `${dirname}/${file.name}`;

        this.http.put(`${this.webdavUrl}${path}`, body, {headers: header})
          .subscribe(
            (value) => {
              console.log('Succesfully uploaded file: ' + file.name);
              resolve('/webdav/' + path);
            },
            (error) => {
              console.log(error);
              reject(error);
            }
          );
      };
      reader.readAsArrayBuffer(file);
    });
  }

  submitJob(jobDescription: JobDescription): Observable<Object> {
    const options = {headers: this.authHeaders()};
    return this.http.post(this.api, jobDescription, options);
  }

  deleteJob(jobId: string): Observable<Object> {
    const options = {headers: this.authHeaders()};
    return this.http.delete(this.api + '/' + jobId, options);
  }

  cancelJob(jobId: string): Observable<Object> {
    const options = {headers: this.authHeaders()};
    return this.http.post(this.api + '/' + jobId + '/cancel', null, options);
  }



  private parsePropfindResponse(content: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    const elements = doc.getElementsByTagName('D:href');
    const output = [];

    for (let i = 0; i < elements.length; i++) {
      const filename = elements.item(i).innerHTML.trim();

      if (filename.toLocaleLowerCase().endsWith('.cwl')) {
        output.push(filename);
      }
    }

    return output;
  }

  private parseCwlFile(path: string, content: string): Workflow {
    const data = safeLoad(content);
    let dataInputs = data.inputs;
    const inputs = [];

    if (!dataInputs) {
      dataInputs = {};
    }

    if (isArray(dataInputs)) {
      const newData = {};

      for (const key in dataInputs) {
        newData[dataInputs[key].id] = dataInputs[key];
      }

      dataInputs = newData;
    }

    if (dataInputs) {
      for (const key in dataInputs) {
        const value = dataInputs[key];

        if (isObject(value)) {
          inputs.push({
            id: key,
            name: (value.label || key).toString(),
            description: value.doc || '',
            type: (value.type || '').toString().toLowerCase(),
            default: value.default || null
          });
        } else {
          inputs.push({
            id: key,
            name: key,
            description: '',
            type: value.toLowerCase(),
            default: null
          });
        }
      }
    }

    if (path.startsWith(this.webdav_dir)) {
      path = path.substr(this.webdav_dir.length);
    }

    return {
      name: data.label,
      description: data.doc || '',
      filename: path,
      inputs: inputs
    };
  }

  get getAllWorkflows(): Promise<Workflow[]> {
    const url = this.webdavUrl + this.cwl_dir;
    const headers = {'Depth': '1'};

    return this.http.request('PROPFIND', url, {headers: headers, responseType: 'text'})
      .toPromise()
      .then(v => {
        const paths = this.parsePropfindResponse(v);

        return Promise.all(paths.map(path => {
          const options = {responseType: 'text'};

          return this.http.get(this.webdav_host + path, {responseType: 'text'})
            .map(content => {
              return this.parseCwlFile(path, content);
            }).toPromise();
        }));
      }).then(workflows => {
        return workflows
          .filter(x => x.name)
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      });
  }
}
