import { createClient } from "../../types";
import { TestStore } from "../utils/testStore";
import { ToggleableNetworkStatus } from "../utils/network";
import server from "../utils/server";
import {
  ADD_TASK,
  GET_TASKS,
  UPDATE_TASK_CLIENT_RESOLUTION
} from "../utils/graphql.queries";

const newNetworkStatus = (online = true) => {
  const networkStatus = new ToggleableNetworkStatus();
  networkStatus.setOnline(online);
  return networkStatus;
};

const newClient = async (clientOptions = {}) => {
  const config = {
    httpUrl: "http://localhost:4000/graphql",
    wsUrl: "ws://localhost:4000/graphql",
    ...clientOptions
  };

  return await createClient(config);
};

describe("Conflicts", function() {

  this.timeout(2000);

  const newTask = {
    description: "new",
    title: "new",
    version: 1,
    author: "new"
  };

  let client;
  let store;

  before("start server", async function() {
    await server.start();
  });

  after("stop server", async function() {
    await server.stop();
  });

  beforeEach("reset server", async function() {
    await server.reset();
  });

  beforeEach("create client", async function() {
    const networkStatus = newNetworkStatus(false);
    store = new TestStore();
    client = await newClient({ networkStatus, storage: store });
  });

  const createBasicConflict = async (mutation, variables1, variables2, secondClient, customConflict?) => {
    networkStatus.setOnline(true);

    const response = await client.mutate({
      mutation: ADD_TASK,
      variables: newTask
    }).catch(error => {
      return;
    });

    const task = response.data.createTask;

    let success = 0;
    let failure = 0;

    let conflict = 0;
    let merge = 0;

    const listener = {
      onOperationSuccess: () => success++,
      onOperationFailure: () => failure++
    };

    const conflictListener = {
      conflictOccurred: () => conflict++,
      mergeOccurred: () => merge++
    };

    if (customConflict) {
      const customStrategy = {
        resolve: ({base: baseData, server: serverData, client: clientData}) => {
          const something = Object.assign(baseData, serverData, clientData);
          something.description = "custom";
          return something;
        }
      };
      client = await newClient({ networkStatus, storage: store, offlineQueueListener: listener, conflictListener, conflictStrategy: customStrategy });
    } else {
      client = await newClient({ networkStatus, storage: store, offlineQueueListener: listener, conflictListener });
    }

    const result = await client.query({
      query: GET_TASKS
    });

    await secondClient.query({
      query: GET_TASKS
    });

    const vars1 = { ...variables1, id: 0, version: 1 };
    const vars2 = { ...variables2, id: 0, version: 1 };
    await secondClient.offlineMutate({
      mutation,
      variables: vars1,
      returnType: "Task"
    }).catch(error => {
      return;
    });

    networkStatus.setOnline(false);

    await client.offlineMutate({
      mutation,
      variables: vars2,
      returnType: "Task"

    }).catch(error => {
      return;
    });

    networkStatus.setOnline(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    return { success, failure, conflict, merge };
  };

  const createAdvancedClientConflict = async (mutation, variables1, variables2, secondClient, customConflict?) => {
    networkStatus.setOnline(true);

    const response = await client.mutate({
      mutation: ADD_TASK,
      variables: newTask
    });

    const task = response.data.createTask;

    let success = 0;
    let failure = 0;

    let conflict = 0;
    let merge = 0;

    const listener = {
      onOperationSuccess: () => success++,
      onOperationFailure: () => failure++
    };

    const conflictListener = {
      conflictOccurred: () => conflict++,
      mergeOccurred: () => merge++
    };

    client = await newClient({ networkStatus, storage: store, offlineQueueListener: listener, conflictListener });

    await client.query({
      query: GET_TASKS
    });

    await secondClient.query({
      query: GET_TASKS
    });

    const vars1 = { ...variables1, id: 0, version: 1 };
    const vars2 = { ...variables2, id: 0, version: 1 };
    const vars3 = { ...variables2, id: 0, version: 1, author: "Advanced conflict author" };
    await secondClient.offlineMutate({
      mutation,
      variables: vars1,
      returnType: "Task"
    });

    networkStatus.setOnline(false);

    await client.offlineMutate({
      mutation,
      variables: vars2,
      returnType: "Task"

    }).catch(error => {
      return;
    });

    await client.offlineMutate({
      mutation,
      variables: vars3,
      returnType: "Task"

    }).catch(error => {
      return;
    });

    networkStatus.setOnline(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    return { success, failure, conflict, merge };
  };

  const createAdvancedServerConflict = async (mutation, variables1, variables2, secondClient, customConflict?) => {
    networkStatus.setOnline(true);

    const response = await client.mutate({
      mutation: ADD_TASK,
      variables: newTask
    });

    const task = response.data.createTask;

    let success = 0;
    let failure = 0;

    let conflict = 0;
    let merge = 0;

    const listener = {
      onOperationSuccess: () => success++,
      onOperationFailure: () => failure++
    };

    const conflictListener = {
      conflictOccurred: () => conflict++,
      mergeOccurred: () => merge++
    };

    client = await newClient({ networkStatus, storage: store, offlineQueueListener: listener, conflictListener });

    await client.query({
      query: GET_TASKS
    });

    await secondClient.query({
      query: GET_TASKS
    });

    const vars1 = { ...variables1, id: 0, version: 1 };
    const vars2 = { ...variables2, id: 0, version: 1 };
    const vars3 = { ...variables2, id: 0, version: 1, author: "Advanced conflict author" };
    await secondClient.offlineMutate({
      mutation,
      variables: vars1,
      returnType: "Task"
    });

    await secondClient.offlineMutate({
      mutation,
      variables: vars2,
      returnType: "Task"
    }).catch(ignore => {
      return;
    });
    networkStatus.setOnline(false);

    await client.offlineMutate({
      mutation,
      variables: vars3,
      returnType: "Task"
    }).catch(error => {
      return;
    });

    networkStatus.setOnline(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    return { success, failure, conflict, merge };
  };

  describe("no conflict should be thrown for mergeable data", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new" };
      const updatedDescription = { title: "new", description: "updated" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });
      const { success, failure } = await createBasicConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedDescription, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(success).toBe(1);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("updated");
      expect(response.data.allTasks[0].description).toBe("updated");
    });

  });

    describe("merge should be called for mergeable conflict", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new", author: "new" };
      const updatedDescription = { title: "new", description: "updated", author: "new" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });

      const {
        success,
        failure,
        conflict,
        merge
      } = await createBasicConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedDescription, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(conflict).toBe(0);
      expect(merge).toBe(1);
      expect(success).toBe(1);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("updated");
      expect(response.data.allTasks[0].description).toBe("updated");
    });

  });

  describe("conflict should be called for unmergeable data", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new" };
      const updatedTitleAgain = { title: "another update with conflict", description: "new" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });
      const { success, failure, conflict } = await createBasicConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedTitleAgain, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(conflict).toBe(1);
      expect(failure).toBe(0);
      expect(success).toBe(1);

    });

  });

  describe("custom resolution strategy should override", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "new", description: "new", author: "new" };
      const updatedDescription = { title: "updated", description: "new", author: "new" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });

      const { success, failure } = await createBasicConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedDescription, client2, true);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(success).toBe(1);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("updated");
      expect(response.data.allTasks[0].description).toBe("custom");
    });

  });

    describe("default strategy should be client wins", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new" };
      const updatedBoth = { title: "client wins", description: "updated" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });
      const { success, failure } = await createBasicConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedBoth, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(success).toBe(1);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("client wins");
      expect(response.data.allTasks[0].description).toBe("updated");
    });

  });

    describe("multiple offline conflicts should be resolved", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new", author: "new" };
      const updatedDescription = { title: "new", description: "updated", author: "new" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });
      const { success, failure } = await createAdvancedClientConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedDescription, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(success).toBe(2);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("updated");
      expect(response.data.allTasks[0].description).toBe("updated");
      expect(response.data.allTasks[0].author).toBe("Advanced conflict author");
    });

  });

    describe("offline conflict should not be affected by multiple server edits", function() {

    it("should succeed", async function() {
      const updatedTitle = { title: "updated", description: "new", author: "new" };
      const updatedDescription = { title: "new", description: "updated", author: "new" };

      const client2 = await newClient({
        networkStatus: newNetworkStatus(),
        storage: new TestStore()
      });

      const { success, failure } = await createAdvancedServerConflict(UPDATE_TASK_CLIENT_RESOLUTION, updatedTitle, updatedDescription, client2);

      const response = await client.query({
        query: GET_TASKS,
        fetchPolicy: "network-only"
      });

      expect(success).toBe(1);
      expect(failure).toBe(0);

      expect(response.data.allTasks).toBeDefined();
      expect(response.data.allTasks.length).toBe(1);
      expect(response.data.allTasks[0].title).toBe("updated");
      expect(response.data.allTasks[0].description).toBe("updated");
      expect(response.data.allTasks[0].author).toBe("Advanced conflict author");
    });

  });

  server.stop();
});
