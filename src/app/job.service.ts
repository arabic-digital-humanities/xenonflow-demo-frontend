import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs/Rx';
import { Job } from './job';
import {WebDAV, Headers} from 'angular-webdav';
import {HttpClient, HttpHeaders} from '@angular/common/http';
import {toBase64String} from '@angular/compiler/src/output/source_map';
import {isArray, isObject, isString} from 'util';
import {safeLoad} from 'js-yaml';


export interface JobDescription {
  name: string;
  input: WorkflowInput;
  workflow: string;
}

export interface WorkflowInput {
  id: string;
  name: string;
  description: string;
  type: string;
  default: any;
  symbols: string[]|null;
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
  private api = 'https://arabic-dh.gap-nlesc.surf-hosted.nl/xenonflow/jobs';
  private webdavHost = 'https://arabic-dh.gap-nlesc.surf-hosted.nl:8443'; // 'http://localhost:8989';
  private webdavDir = '/';
  private cwl_dir = 'source/cwl/';

  constructor(
    private http: HttpClient,
    private webdav: WebDAV
  ) {
    this._selectedJob = <BehaviorSubject<Job>>new BehaviorSubject(null);
    this._updateList = <BehaviorSubject<boolean>>new BehaviorSubject(false);
    this._isConnected = new BehaviorSubject<boolean>(false);
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
    return this.webdavHost + this.webdavDir;
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
    const options = {
      headers: headers,
      responseType: 'text' as 'text'
    };

    return new Promise<boolean>((resolve, reject) => {
      this.http.get(dir_url, options).subscribe(
        (value) => {
          resolve(true);
        },
        (error) => {
          if (error.status === 404) {
            console.log('options', options);
            this.http.request('mkcol', dir_url, options).subscribe(
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
        const options = {
          headers: this.authHeaders(),
          responseType: 'text' as 'text'
        };

        const path = `${dirname}/${file.name}`;

        this.http.put(`${this.webdavUrl}${path}`, body, options)
          .subscribe(
            (value) => {
              console.log('Succesfully uploaded file: ' + file.name);
              resolve(path);
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

  private parseInput(id: string, input: any): WorkflowInput {
    const result = {};

    if (isString(input)) {
      return this.parseInput(id, {type: input});
    }

    let type = null;
    let symbols = null;

    if (input.type === null) {
      type = 'text';
    } else if (isString(input.type)) {
      type = input.type.toLowerCase();
    } else if (isObject(input.type) && input.type.type.toLowerCase() === 'enum') {
      type = 'enum';
      symbols = input.type.symbols;
    } else {
      console.warn('Could not parse data type for parseInput', input.type);
    }

    return {
      id: id,
      name: input.label || id,
      description: input.doc || '',
      default: input.default || null,
      type: type,
      symbols: symbols
    };
  }

  private parseInputs(inputs: any): WorkflowInput[] {
    if (inputs === null) {
      return [];

    } else if (isArray(inputs)) {
      return inputs.map(input => {
        return this.parseInput(input.id, input);
      });

    } else if (isObject(inputs)) {
      return Object.keys(inputs).map(id => {
        return this.parseInput(id, inputs[id]);
      });

    } else {
      throw Error('invalid data type for parseInputs');
    }
  }

  private parseCwlFile(path: string, content: string): Workflow {
    const data = safeLoad(content);
    const inputs = this.parseInputs(data.inputs);

    if (path.startsWith(this.webdavDir)) {
      path = path.substr(this.webdavDir.length);
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
    let headers = this.authHeaders();
    headers = headers.set('Depth', '1');

    const options = {
      headers: headers,
      responseType: 'text' as 'text'
    };

    return this.http.request('PROPFIND', url, options)
      .toPromise()
      .then(v => {
        const paths = this.parsePropfindResponse(v);

        return Promise.all(paths.map(path => {
          return this.http.get(this.webdavHost + path, options)
            .map(content => {
              return this.parseCwlFile(path, content);
            }).toPromise();
        }));
      }).then(workflows => {
        return workflows
          .filter(x => x.name)
          .sort((a, b) => a.name.localeCompare(b.name));
      });
  }
}
